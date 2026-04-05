"""GET /api/leaderboard — ranked team leaderboard with tiebreakers."""

from fastapi import APIRouter, Query, Response

from lib.db import get_supabase
from lib.models import (
    GolferScore,
    GolferStatus,
    PaymentStatus,
    Team,
    TeamGolferSlot,
    TeamStatus,
    Tier,
)
from lib.scoring import rank_teams

router = APIRouter(tags=["leaderboard"])

# Map DB tier integers to Tier enum
_TIER_MAP = {1: Tier.TIER_1, 2: Tier.TIER_2, 3: Tier.TIER_3, 4: Tier.TIER_4}
# DB stores ESPN status strings directly
_STATUS_MAP = {
    "STATUS_IN_PROGRESS": GolferStatus.IN_PROGRESS,
    "STATUS_FINAL": GolferStatus.FINAL,
    "STATUS_CUT": GolferStatus.CUT,
    "STATUS_WITHDRAWN": GolferStatus.WITHDRAWN,
    "STATUS_DISQUALIFIED": GolferStatus.DISQUALIFIED,
    "STATUS_SUSPENDED": GolferStatus.SUSPENDED,
}


@router.get("/leaderboard")
def get_leaderboard(
    response: Response,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    response.headers["Cache-Control"] = "public, s-maxage=30, stale-while-revalidate=60"

    db = get_supabase()

    # Fetch all golfers and build GolferScore map
    golfers_resp = db.table("golfers").select("*").execute()
    golfer_scores: dict[str, GolferScore] = {}
    golfer_raw_map: dict[str, dict] = {}
    for g in golfers_resp.data:
        golfer_raw_map[g["id"]] = g
        round_scores_raw = g.get("round_scores") or []
        golfer_scores[g["id"]] = GolferScore(
            espn_id=g["id"],
            name=g["name"],
            world_rank=g.get("world_rank"),
            tier=_TIER_MAP.get(g.get("tier")),
            position=g.get("position"),
            score_to_par=g.get("score_to_par"),
            thru=g.get("thru"),
            status=_STATUS_MAP.get(g.get("status"), GolferStatus.IN_PROGRESS),
            round_scores=round_scores_raw,
            total_strokes=g.get("total_strokes"),
        )

    _TIER_COLS = [
        ("tier1_golfer_id", Tier.TIER_1),
        ("tier2a_golfer_id", Tier.TIER_2),
        ("tier2b_golfer_id", Tier.TIER_2),
        ("tier3_golfer_id", Tier.TIER_3),
        ("tier4_golfer_id", Tier.TIER_4),
    ]

    # Fetch all paid teams with contestant names
    teams_resp = (
        db.table("teams")
        .select(
            "id, team_name, status, payment_status, "
            "tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id, tier3_golfer_id, tier4_golfer_id, "
            "contestant_id, contestants(name)"
        )
        .eq("payment_status", "completed")
        .execute()
    )

    # Convert DB rows to Team models
    teams: list[Team] = []
    team_meta: dict[str, dict] = {}  # team_id -> extra display info

    for row in teams_resp.data:
        slots: list[TeamGolferSlot] = []
        golfer_ids_for_team: list[str] = []
        for field, tier in _TIER_COLS:
            gid = row.get(field)
            if gid and gid in golfer_raw_map:
                slots.append(TeamGolferSlot(
                    golfer_id=gid,
                    golfer_name=golfer_raw_map[gid]["name"],
                    tier=tier,
                ))
                golfer_ids_for_team.append(gid)

        team = Team(
            id=row["id"],
            contestant_id=row["contestant_id"],
            team_name=row.get("team_name", ""),
            golfers=slots,
            status=TeamStatus(row["status"]) if row["status"] in ("active", "disqualified") else TeamStatus.ACTIVE,
            payment_status=PaymentStatus(row["payment_status"]),
        )
        teams.append(team)

        contestant = row.get("contestants") or {}
        team_meta[row["id"]] = {
            "contestant_name": contestant.get("name"),
            "golfer_ids": golfer_ids_for_team,
        }

    # Rank teams using scoring module
    ranked = rank_teams(teams, golfer_scores)

    # Get last update time
    state = db.table("tournament_state").select("last_score_update").eq("id", True).single().execute()
    last_updated = state.data.get("last_score_update") if state.data else None

    # Build response
    leaderboard = []
    for st in ranked:
        meta = team_meta.get(st.team.id, {})
        golfer_details = []
        for gid in meta.get("golfer_ids", []):
            g = golfer_raw_map.get(gid)
            if g:
                golfer_details.append({
                    "id": g["id"],
                    "name": g["name"],
                    "world_rank": g.get("world_rank"),
                    "tier": g.get("tier"),
                    "score_to_par": g.get("score_to_par"),
                    "thru": g.get("thru"),
                    "status": g.get("status"),
                    "round_scores": g.get("round_scores"),
                })

        leaderboard.append({
            "rank": st.rank,
            "team_id": st.team.id,
            "team_name": st.team.team_name,
            "contestant_name": meta.get("contestant_name"),
            "total_score": st.total_score,
            "status": "disqualified" if st.is_disqualified else "active",
            "golfers": golfer_details,
        })

    # Paginate
    page = leaderboard[offset : offset + limit]

    return {
        "teams": page,
        "total": len(leaderboard),
        "last_updated": last_updated,
    }
