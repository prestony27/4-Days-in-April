"""GET/POST /api/cron/update-scores — called by Vercel Cron (GET) to refresh scores from ESPN."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from lib.db import get_supabase
from lib.espn_client import ESPNClient, MASTERS_2026_ID

router = APIRouter(tags=["cron"])
logger = logging.getLogger(__name__)

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _verify_cron_auth(authorization: str | None) -> None:
    """Verify the request comes from Vercel Cron or an authorized caller."""
    import hmac
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="Cron secret not configured")
    if not hmac.compare_digest(authorization or "", f"Bearer {CRON_SECRET}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.api_route("/cron/update-scores", methods=["GET", "POST"])
async def update_scores(authorization: str | None = Header(None)):
    _verify_cron_auth(authorization)
    return await _do_update()


async def _do_update() -> dict:
    client = ESPNClient()
    db = get_supabase()

    # Fetch live scores
    try:
        golfer_scores = await client.get_leaderboard(MASTERS_2026_ID)
        tournament_state = await client.get_tournament_state(MASTERS_2026_ID)
    except Exception as e:
        logger.error("ESPN API fetch failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"ESPN API error: {e}")

    # Update tournament state (single-row table keyed by boolean true)
    db.table("tournament_state").upsert({
        "id": True,
        "current_round": tournament_state.current_round,
        "tournament_status": tournament_state.tournament_status.value,
        "submissions_open": tournament_state.submissions_open,
        "last_score_update": tournament_state.last_score_update.isoformat() if tournament_state.last_score_update else None,
    }).execute()

    # Update golfer scores in DB
    # First get existing golfer map (espn_id might differ from DB id, so match by name)
    existing_resp = db.table("golfers").select("id, name").execute()
    name_to_db_id = {g["name"].lower().strip(): g["id"] for g in existing_resp.data}

    updated_count = 0
    for gs in golfer_scores:
        db_id = name_to_db_id.get(gs.name.lower().strip())
        if not db_id:
            logger.debug("Golfer not in DB (not in field?): %s", gs.name)
            continue

        # round_scores stored as JSON array: [66, 64, null, null]
        round_scores = gs.round_scores

        db.table("golfers").update({
            "score_to_par": gs.score_to_par,
            "position": gs.position,
            "thru": gs.thru,
            "status": gs.status.value,  # DB stores ESPN status strings directly
            "round_scores": round_scores,
            "total_strokes": gs.total_strokes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", db_id).execute()
        updated_count += 1

    # Recalculate team scores
    teams_updated = _recalculate_teams(db)

    return {
        "golfers_updated": updated_count,
        "teams_recalculated": teams_updated,
        "tournament_round": tournament_state.current_round,
        "tournament_status": tournament_state.tournament_status.value,
    }


_TIER_COLS = ("tier1_golfer_id", "tier2a_golfer_id", "tier2b_golfer_id", "tier3_golfer_id", "tier4_golfer_id")


def _recalculate_teams(db) -> int:
    """Recalculate all paid team scores based on current golfer scores."""
    golfers_resp = db.table("golfers").select("id, score_to_par, status").execute()
    golfer_map = {g["id"]: g for g in golfers_resp.data}

    teams_resp = (
        db.table("teams")
        .select("id, " + ", ".join(_TIER_COLS) + ", total_score, status")
        .eq("payment_status", "completed")
        .execute()
    )

    updated = 0
    for team in teams_resp.data:
        total = 0
        is_dq = False
        has_score = False

        for col in _TIER_COLS:
            gid = team.get(col)
            if not gid:
                continue
            g = golfer_map.get(gid)
            if not g:
                continue
            if g["status"] in ("STATUS_WITHDRAWN", "STATUS_DISQUALIFIED"):
                is_dq = True
                break
            if g["score_to_par"] is not None:
                total += g["score_to_par"]
                has_score = True

        new_score = None if is_dq or not has_score else total
        new_status = "disqualified" if is_dq else "active"

        if new_score != team.get("total_score") or new_status != team["status"]:
            db.table("teams").update({
                "total_score": new_score,
                "status": new_status,
            }).eq("id", team["id"]).execute()
            updated += 1

    return updated
