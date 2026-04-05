"""POST /api/webhooks/payment — Stripe webhook to confirm payment."""

from __future__ import annotations

import os

import stripe
from fastapi import APIRouter, Header, HTTPException, Request

from lib.db import get_supabase

router = APIRouter(tags=["webhooks"])

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


@router.post("/webhooks/payment")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(alias="stripe-signature"),
):
    stripe.api_key = STRIPE_SECRET_KEY
    payload = await request.body()

    # Verify webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle checkout.session.completed
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        team_id = session.get("client_reference_id") or session.get("metadata", {}).get("team_id")

        if team_id:
            db = get_supabase()
            # Idempotency: only update if not already completed (Stripe retries for 72h)
            team = db.table("teams").select("payment_status").eq("id", team_id).execute()
            if team.data and team.data[0]["payment_status"] != "completed":
                db.table("teams").update({
                    "payment_status": "completed",
                    "payment_id": session.get("payment_intent") or session.get("id"),
                    "status": "active",
                }).eq("id", team_id).execute()

    # Handle refund events
    elif event["type"] == "charge.refunded":
        charge = event["data"]["object"]
        payment_intent = charge.get("payment_intent")
        if payment_intent:
            db = get_supabase()
            db.table("teams").update({
                "payment_status": "refunded",
            }).eq("payment_id", payment_intent).execute()

    return {"received": True}
