"""GET /api/golfers and GET /api/golfers/{golfer_id}"""

from fastapi import APIRouter, HTTPException, Query, Response

from lib.db import get_supabase

router = APIRouter(tags=["golfers"])


@router.get("/golfers")
def list_golfers(
    response: Response,
    tier: str | None = Query(None, description="Filter by tier: 1, 2, 3, 4 (or tier1, tier2, etc.)"),
):
    response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=120"

    db = get_supabase()
    query = db.table("golfers").select("id, name, world_rank, tier, score_to_par, thru, status, round_scores")

    if tier:
        # Accept both "1" and "tier1" formats — DB column is INTEGER
        tier_str = tier.lower().replace("tier", "").strip()
        if tier_str.isdigit() and int(tier_str) in (1, 2, 3, 4):
            query = query.eq("tier", int(tier_str))
        else:
            raise HTTPException(status_code=400, detail="Invalid tier. Use 1, 2, 3, or 4.")

    query = query.order("world_rank")
    result = query.execute()

    return {"golfers": result.data, "count": len(result.data)}


@router.get("/golfers/{golfer_id}")
def get_golfer(golfer_id: str, response: Response):
    response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=120"

    db = get_supabase()
    result = db.table("golfers").select("*").eq("id", golfer_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Golfer not found")

    return result.data[0]
