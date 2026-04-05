"""POST /api/submit-team — validate picks and create Stripe Checkout Session."""

from __future__ import annotations

import os

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from lib.db import get_supabase
from lib.validation import ValidationError, run_all_validations, MAX_TEAMS_PER_EMAIL

router = APIRouter(tags=["submit"])
limiter = Limiter(key_func=get_remote_address)

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ENTRY_FEE_CENTS = 3000  # $30.00

_TIER_COLS = ("tier1_golfer_id", "tier2a_golfer_id", "tier2b_golfer_id", "tier3_golfer_id", "tier4_golfer_id")


class GolferPicks(BaseModel):
    tier1: str
    tier2_a: str
    tier2_b: str
    tier3: str
    tier4: str


class SubmitTeamRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    team_name: str = Field(min_length=1, max_length=100)
    golfers: GolferPicks


@router.post("/submit-team")
@limiter.limit("5/minute")
def submit_team(request: Request, body: SubmitTeamRequest):
    # Normalize email to prevent duplicate contestants
    email = body.email.lower().strip()

    # Run all validations (deadline, tiers, duplicates, max teams)
    try:
        golfer_picks_raw = body.golfers.model_dump()
        enriched = run_all_validations(email, golfer_picks_raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"message": e.message, "field": e.field})

    db = get_supabase()

    # Get or create contestant (use upsert to avoid race on concurrent first-time submissions)
    contestant_resp = db.table("contestants").select("id").eq("email", email).execute()
    if contestant_resp.data:
        contestant_id = contestant_resp.data[0]["id"]
    else:
        insert_resp = (
            db.table("contestants")
            .upsert({"email": email, "name": body.name}, on_conflict="email")
            .execute()
        )
        contestant_id = insert_resp.data[0]["id"]

    # Build tier-specific golfer columns
    tier_map = {}
    tier2_golfers = []
    for p in enriched:
        tier_val = p["tier"]
        if tier_val == 1:
            tier_map["tier1_golfer_id"] = p["golfer_id"]
        elif tier_val == 2:
            tier2_golfers.append(p["golfer_id"])
        elif tier_val == 3:
            tier_map["tier3_golfer_id"] = p["golfer_id"]
        elif tier_val == 4:
            tier_map["tier4_golfer_id"] = p["golfer_id"]

    if len(tier2_golfers) == 2:
        tier_map["tier2a_golfer_id"] = tier2_golfers[0]
        tier_map["tier2b_golfer_id"] = tier2_golfers[1]

    # Insert team (pending payment)
    team_data = {
        "contestant_id": contestant_id,
        "team_name": body.team_name,
        "status": "active",
        "payment_status": "pending",
        **tier_map,
    }
    team_resp = db.table("teams").insert(team_data).execute()
    team_id = team_resp.data[0]["id"]

    # Post-insert race condition checks (catches concurrent submissions)
    # 1. Max 3 completed teams
    completed_teams = (
        db.table("teams")
        .select("id", count="exact")
        .eq("contestant_id", contestant_id)
        .eq("payment_status", "completed")
        .execute()
    )
    if completed_teams.count is not None and completed_teams.count > MAX_TEAMS_PER_EMAIL:
        db.table("teams").delete().eq("id", team_id).execute()
        raise HTTPException(
            status_code=409,
            detail={"message": f"Maximum of {MAX_TEAMS_PER_EMAIL} teams per person.", "field": "email"},
        )

    # 2. Max 1 pending team (prevent orphan-team attack)
    pending_teams = (
        db.table("teams")
        .select("id", count="exact")
        .eq("contestant_id", contestant_id)
        .eq("payment_status", "pending")
        .execute()
    )
    if pending_teams.count is not None and pending_teams.count > 1:
        db.table("teams").delete().eq("id", team_id).execute()
        raise HTTPException(
            status_code=409,
            detail={"message": "Complete or cancel your pending payment before submitting another team.", "field": "email"},
        )

    # Post-insert race condition check: verify no duplicate golfers snuck in
    new_golfer_ids = set(tier_map.values())
    other_teams = (
        db.table("teams")
        .select(", ".join(_TIER_COLS))
        .eq("contestant_id", contestant_id)
        .in_("payment_status", ["completed", "pending"])
        .neq("id", team_id)
        .execute()
    )
    existing_golfer_ids: set[str] = set()
    for t in other_teams.data:
        existing_golfer_ids.update(t[col] for col in _TIER_COLS if t.get(col))

    overlap = new_golfer_ids & existing_golfer_ids
    if overlap:
        db.table("teams").delete().eq("id", team_id).execute()
        raise HTTPException(
            status_code=409,
            detail={"message": "A golfer on this team is already on another of your teams.", "field": "golfers"},
        )

    # Create Stripe Checkout Session
    stripe.api_key = STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Masters Pool Entry: {body.team_name}",
                        "description": f"Team entry for {body.name}",
                    },
                    "unit_amount": ENTRY_FEE_CENTS,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{FRONTEND_URL}/submit/success?team_id={team_id}",
            cancel_url=f"{FRONTEND_URL}/teams/builder?cancelled=true",
            client_reference_id=team_id,
            customer_email=email,
            metadata={
                "team_id": team_id,
                "contestant_id": contestant_id,
            },
        )
    except stripe.StripeError as e:
        # Clean up the team if Stripe fails
        db.table("teams").delete().eq("id", team_id).execute()
        raise HTTPException(status_code=502, detail=f"Payment service error: {e.user_message or str(e)}")

    # Store Stripe session ID on the team
    db.table("teams").update({"payment_id": session.id}).eq("id", team_id).execute()

    return {
        "team_id": team_id,
        "payment_url": session.url,
    }
