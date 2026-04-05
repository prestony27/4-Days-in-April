"""GET /api/my-teams?email=... — all teams for a given email."""

from fastapi import APIRouter, HTTPException, Query, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from lib.db import get_supabase

router = APIRouter(tags=["my-teams"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/my-teams")
@limiter.limit("15/minute")
def get_my_teams(
    request: Request,
    response: Response,
    email: str = Query(..., description="Email address to look up teams for"),
):
    # User-specific — never cache
    response.headers["Cache-Control"] = "private, no-store"

    # Normalize email for consistent lookup
    email = email.lower().strip()

    db = get_supabase()

    # Find contestant
    contestant_resp = db.table("contestants").select("id, name").eq("email", email).execute()
    if not contestant_resp.data:
        return {"teams": [], "count": 0}

    contestant = contestant_resp.data[0]

    _TIER_COLS = ("tier1_golfer_id", "tier2a_golfer_id", "tier2b_golfer_id", "tier3_golfer_id", "tier4_golfer_id")

    # Get their teams
    teams_resp = (
        db.table("teams")
        .select(
            "id, team_name, total_score, status, payment_status, submitted_at, "
            + ", ".join(_TIER_COLS)
        )
        .eq("contestant_id", contestant["id"])
        .order("submitted_at")
        .execute()
    )

    if not teams_resp.data:
        return {"teams": [], "count": 0}

    # Collect all golfer IDs across all teams
    all_golfer_ids: list[str] = []
    for team in teams_resp.data:
        all_golfer_ids.extend(team[col] for col in _TIER_COLS if team.get(col))

    # Fetch golfer details in one query
    golfer_map: dict[str, dict] = {}
    if all_golfer_ids:
        golfers_resp = (
            db.table("golfers")
            .select("id, name, world_rank, tier, score_to_par, thru, status")
            .in_("id", list(set(all_golfer_ids)))
            .execute()
        )
        golfer_map = {g["id"]: g for g in golfers_resp.data}

    # Assemble response
    teams = []
    for team in teams_resp.data:
        team_golfer_ids = [team[col] for col in _TIER_COLS if team.get(col)]
        team_golfers = [golfer_map[gid] for gid in team_golfer_ids if gid in golfer_map]
        teams.append({
            "id": team["id"],
            "team_name": team.get("team_name"),
            "contestant_name": contestant["name"],
            "total_score": team.get("total_score"),
            "status": team["status"],
            "payment_status": team["payment_status"],
            "golfers": team_golfers,
            "submitted_at": team.get("submitted_at"),
        })

    return {"teams": teams, "count": len(teams)}
