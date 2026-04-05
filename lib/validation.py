"""Team submission validation: tiers, duplicates, deadline, max teams."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from lib.db import get_supabase
from lib.models import Tier

# Deadline: 5:00 AM EST, Thursday April 9, 2026
SUBMISSION_DEADLINE = datetime(2026, 4, 9, 5, 0, 0, tzinfo=ZoneInfo("America/New_York"))

MAX_TEAMS_PER_EMAIL = 3

# Tier → required WGR range
TIER_RANK_RANGES: dict[int, tuple[int, int]] = {
    Tier.TIER_1: (1, 10),
    Tier.TIER_2: (11, 30),
    Tier.TIER_3: (31, 50),
    Tier.TIER_4: (51, 999),
}

# Tier → how many picks from that tier
TIER_PICK_COUNTS: dict[int, int] = {
    Tier.TIER_1: 1,
    Tier.TIER_2: 2,
    Tier.TIER_3: 1,
    Tier.TIER_4: 1,
}


class ValidationError(Exception):
    def __init__(self, message: str, field: str | None = None):
        self.message = message
        self.field = field
        super().__init__(message)


def check_submissions_open() -> None:
    """Raise if submissions are closed by deadline or manual override."""
    now = datetime.now(timezone.utc)
    if now >= SUBMISSION_DEADLINE.astimezone(timezone.utc):
        raise ValidationError("Submissions are closed. The deadline was 5:00 AM EST, April 9th.")

    db = get_supabase()
    state = db.table("tournament_state").select("submissions_open").eq("id", 1).single().execute()
    if state.data and not state.data["submissions_open"]:
        raise ValidationError("Submissions have been manually closed.")


def validate_tier_placement(golfer_picks: list[dict]) -> None:
    """Validate each golfer is in the correct tier based on world_rank.

    golfer_picks: list of dicts with keys: golfer_id, tier (int), world_rank (int)
    """
    for pick in golfer_picks:
        tier = pick["tier"]
        rank = pick["world_rank"]
        low, high = TIER_RANK_RANGES[tier]
        if not (low <= rank <= high):
            raise ValidationError(
                f"Golfer '{pick['name']}' (rank {rank}) does not belong in Tier {tier} "
                f"(ranks {low}-{high}).",
                field="golfers",
            )


def validate_tier_composition(golfer_picks: list[dict]) -> None:
    """Validate correct number of golfers per tier: 1 T1, 2 T2, 1 T3, 1 T4."""
    if len(golfer_picks) != 5:
        raise ValidationError("A team must have exactly 5 golfers.", field="golfers")

    tier_counts: dict[int, int] = {}
    for pick in golfer_picks:
        tier_counts[pick["tier"]] = tier_counts.get(pick["tier"], 0) + 1

    for tier_val, expected in TIER_PICK_COUNTS.items():
        actual = tier_counts.get(tier_val, 0)
        if actual != expected:
            raise ValidationError(
                f"Tier {tier_val} requires {expected} golfer(s), but got {actual}.",
                field="golfers",
            )


def validate_no_duplicate_golfers(email: str, new_golfer_ids: list[str]) -> None:
    """Ensure no golfer appears on more than one of a contestant's paid teams."""
    db = get_supabase()

    # Get contestant
    contestant_resp = db.table("contestants").select("id").eq("email", email).execute()
    if not contestant_resp.data:
        return  # New contestant, no existing teams

    contestant_id = contestant_resp.data[0]["id"]

    # Get existing paid teams
    teams_resp = (
        db.table("teams")
        .select("golfer_ids")
        .eq("contestant_id", contestant_id)
        .eq("payment_status", "paid")
        .execute()
    )

    existing_golfer_ids: set[str] = set()
    for team in teams_resp.data:
        existing_golfer_ids.update(team["golfer_ids"])

    for gid in new_golfer_ids:
        if gid in existing_golfer_ids:
            # Look up golfer name for a helpful error message
            golfer_resp = db.table("golfers").select("name").eq("id", gid).single().execute()
            name = golfer_resp.data["name"] if golfer_resp.data else gid
            raise ValidationError(
                f"{name} is already on another of your teams.",
                field="golfers",
            )


def validate_max_teams(email: str) -> None:
    """Ensure contestant hasn't exceeded the max team limit."""
    db = get_supabase()

    contestant_resp = db.table("contestants").select("id").eq("email", email).execute()
    if not contestant_resp.data:
        return  # New contestant

    contestant_id = contestant_resp.data[0]["id"]

    teams_resp = (
        db.table("teams")
        .select("id", count="exact")
        .eq("contestant_id", contestant_id)
        .in_("payment_status", ["paid", "unpaid"])
        .execute()
    )

    if teams_resp.count is not None and teams_resp.count >= MAX_TEAMS_PER_EMAIL:
        raise ValidationError(
            f"Maximum of {MAX_TEAMS_PER_EMAIL} teams per person. "
            "You already have the maximum number of teams.",
            field="email",
        )


def validate_golfers_exist(golfer_ids: list[str]) -> list[dict]:
    """Verify all golfer IDs exist in the database. Returns golfer rows."""
    db = get_supabase()
    resp = db.table("golfers").select("id, name, world_rank, tier").in_("id", golfer_ids).execute()

    found_ids = {g["id"] for g in resp.data}
    missing = set(golfer_ids) - found_ids
    if missing:
        raise ValidationError(f"Unknown golfer ID(s): {', '.join(missing)}", field="golfers")

    return resp.data


def run_all_validations(email: str, golfer_picks_raw: dict) -> list[dict]:
    """Run all submission validations. Returns enriched golfer pick data.

    golfer_picks_raw: {"tier1": "uuid", "tier2_a": "uuid", "tier2_b": "uuid", "tier3": "uuid", "tier4": "uuid"}
    """
    # Map the request format to tier assignments
    tier_assignments = [
        {"golfer_id": golfer_picks_raw["tier1"], "tier": Tier.TIER_1},
        {"golfer_id": golfer_picks_raw["tier2_a"], "tier": Tier.TIER_2},
        {"golfer_id": golfer_picks_raw["tier2_b"], "tier": Tier.TIER_2},
        {"golfer_id": golfer_picks_raw["tier3"], "tier": Tier.TIER_3},
        {"golfer_id": golfer_picks_raw["tier4"], "tier": Tier.TIER_4},
    ]

    golfer_ids = [p["golfer_id"] for p in tier_assignments]

    # Check deadline and submissions open
    check_submissions_open()

    # Verify golfers exist and get their data
    golfer_rows = validate_golfers_exist(golfer_ids)
    golfer_map = {g["id"]: g for g in golfer_rows}

    # Enrich tier assignments with DB data
    enriched = []
    for assignment in tier_assignments:
        gid = assignment["golfer_id"]
        row = golfer_map[gid]
        enriched.append({
            "golfer_id": gid,
            "tier": assignment["tier"],
            "name": row["name"],
            "world_rank": row["world_rank"],
        })

    # Validate tier composition (1-2-1-1)
    validate_tier_composition(enriched)

    # Validate each golfer is in the correct tier by world rank
    validate_tier_placement(enriched)

    # Check no duplicate golfers across contestant's paid teams
    validate_no_duplicate_golfers(email, golfer_ids)

    # Check max teams
    validate_max_teams(email)

    return enriched
