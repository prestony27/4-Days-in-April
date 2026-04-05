"""GET /api/teams/{team_id} — single team details."""

from fastapi import APIRouter, HTTPException, Response

from lib.db import get_supabase

router = APIRouter(tags=["teams"])


@router.get("/teams/{team_id}")
def get_team(team_id: str, response: Response):
    response.headers["Cache-Control"] = "public, s-maxage=30, stale-while-revalidate=60"

    db = get_supabase()

    # Fetch team with contestant name
    team_resp = (
        db.table("teams")
        .select("*, contestants(name, email)")
        .eq("id", team_id)
        .eq("payment_status", "completed")
        .execute()
    )

    if not team_resp.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_resp.data[0]

    # Collect golfer IDs from tier columns
    golfer_ids = [
        team[col] for col in
        ("tier1_golfer_id", "tier2a_golfer_id", "tier2b_golfer_id", "tier3_golfer_id", "tier4_golfer_id")
        if team.get(col)
    ]
    golfers_resp = (
        db.table("golfers")
        .select("id, name, world_rank, tier, score_to_par, thru, status, round_scores")
        .in_("id", golfer_ids)
        .execute()
    )

    contestant = team.get("contestants", {})

    return {
        "id": team["id"],
        "team_name": team.get("team_name"),
        "contestant_name": contestant.get("name") if contestant else None,
        "total_score": team.get("total_score"),
        "status": team["status"],
        "payment_status": team["payment_status"],
        "golfers": golfers_resp.data,
        "submitted_at": team.get("submitted_at"),
    }
