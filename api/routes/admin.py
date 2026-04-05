"""Admin endpoints — protected by API key."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from pydantic import BaseModel, Field

from lib.db import get_supabase

router = APIRouter(tags=["admin"])

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")


def _verify_admin(authorization: str | None) -> None:
    import hmac
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if not hmac.compare_digest(authorization or "", f"Bearer {ADMIN_API_KEY}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


class RankingUpdate(BaseModel):
    golfer_id: str
    world_rank: int
    tier: int = Field(ge=1, le=4)


class BulkRankingUpdate(BaseModel):
    golfers: list[RankingUpdate]


@router.post("/admin/update-rankings")
def update_rankings(body: BulkRankingUpdate, authorization: str | None = Header(None)):
    """Manually update golfer world rankings and tiers (Monday before Masters)."""
    _verify_admin(authorization)

    db = get_supabase()
    updated = 0

    for g in body.golfers:
        db.table("golfers").update({
            "world_rank": g.world_rank,
            "tier": g.tier,
        }).eq("id", g.golfer_id).execute()
        updated += 1

    return {"updated": updated}


@router.post("/admin/close-submissions")
def close_submissions(authorization: str | None = Header(None)):
    """Manually close submissions (emergency override)."""
    _verify_admin(authorization)

    db = get_supabase()
    db.table("tournament_state").update({
        "submissions_open": False,
    }).eq("id", True).execute()

    return {"status": "submissions_closed"}


@router.post("/admin/open-submissions")
def open_submissions(authorization: str | None = Header(None)):
    """Re-open submissions (e.g., after pre-tournament withdrawal replacement window)."""
    _verify_admin(authorization)

    db = get_supabase()
    db.table("tournament_state").update({
        "submissions_open": True,
    }).eq("id", True).execute()

    return {"status": "submissions_opened"}


class GolferCreate(BaseModel):
    id: str  # ESPN athlete ID — required, no DB default
    name: str
    world_rank: int
    tier: int = Field(ge=1, le=4)


class BulkGolferCreate(BaseModel):
    golfers: list[GolferCreate]


@router.post("/admin/seed-golfers")
def seed_golfers(body: BulkGolferCreate, authorization: str | None = Header(None)):
    """Seed golfer data for the tournament field."""
    _verify_admin(authorization)

    db = get_supabase()
    rows = [g.model_dump() for g in body.golfers]
    result = db.table("golfers").insert(rows).execute()

    return {"created": len(result.data)}


# --- Manual Score Entry (ESPN fallback) ---


class ScoreUpdate(BaseModel):
    golfer_id: str
    score_to_par: Optional[int] = None
    thru: Optional[int] = None
    status: Optional[str] = None  # STATUS_IN_PROGRESS, STATUS_FINAL, STATUS_CUT, etc.
    round_scores: Optional[list[Optional[int]]] = None
    position: Optional[str] = None
    total_strokes: Optional[int] = None


class BulkScoreUpdate(BaseModel):
    golfers: list[ScoreUpdate]


_VALID_STATUSES = {
    "STATUS_IN_PROGRESS", "STATUS_FINAL", "STATUS_CUT",
    "STATUS_WITHDRAWN", "STATUS_DISQUALIFIED", "STATUS_SUSPENDED",
}


@router.post("/admin/update-score")
def update_score(body: ScoreUpdate, authorization: str | None = Header(None)):
    """Manually update a single golfer's score (ESPN fallback)."""
    _verify_admin(authorization)

    if body.status and body.status not in _VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {_VALID_STATUSES}")

    db = get_supabase()

    update_data = {}
    if body.score_to_par is not None:
        update_data["score_to_par"] = body.score_to_par
    if body.thru is not None:
        update_data["thru"] = body.thru
    if body.status is not None:
        update_data["status"] = body.status
    if body.round_scores is not None:
        update_data["round_scores"] = body.round_scores
    if body.position is not None:
        update_data["position"] = body.position
    if body.total_strokes is not None:
        update_data["total_strokes"] = body.total_strokes

    if not update_data:
        raise HTTPException(status_code=422, detail="No fields to update")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = db.table("golfers").update(update_data).eq("id", body.golfer_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Golfer {body.golfer_id} not found")

    # Update tournament state timestamp
    db.table("tournament_state").update({"last_score_update": datetime.now(timezone.utc).isoformat()}).eq("id", True).execute()

    return {"updated": body.golfer_id}


@router.post("/admin/update-scores-bulk")
def update_scores_bulk(body: BulkScoreUpdate, authorization: str | None = Header(None)):
    """Manually update multiple golfer scores at once (ESPN fallback)."""
    _verify_admin(authorization)

    db = get_supabase()
    updated = 0
    errors = []

    for g in body.golfers:
        if g.status and g.status not in _VALID_STATUSES:
            errors.append({"golfer_id": g.golfer_id, "error": f"Invalid status: {g.status}"})
            continue

        update_data = {}
        if g.score_to_par is not None:
            update_data["score_to_par"] = g.score_to_par
        if g.thru is not None:
            update_data["thru"] = g.thru
        if g.status is not None:
            update_data["status"] = g.status
        if g.round_scores is not None:
            update_data["round_scores"] = g.round_scores
        if g.position is not None:
            update_data["position"] = g.position
        if g.total_strokes is not None:
            update_data["total_strokes"] = g.total_strokes

        if not update_data:
            continue

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.table("golfers").update(update_data).eq("id", g.golfer_id).execute()
        updated += 1

    # Update tournament state timestamp
    if updated > 0:
        db.table("tournament_state").update({"last_score_update": datetime.now(timezone.utc).isoformat()}).eq("id", True).execute()

    # Recalculate team scores
    teams_recalculated = 0
    if updated > 0:
        from api.routes.cron import _recalculate_teams
        teams_recalculated = _recalculate_teams(db)

    return {"updated": updated, "teams_recalculated": teams_recalculated, "errors": errors}
