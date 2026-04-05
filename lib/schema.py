"""Single source of truth for database schema constants.

All table names, column names, and valid enum values live here.
Import from this module instead of hardcoding strings in route files.
"""

# --- Table names ---
TABLE_GOLFERS = "golfers"
TABLE_CONTESTANTS = "contestants"
TABLE_TEAMS = "teams"
TABLE_TOURNAMENT_STATE = "tournament_state"

# --- Tournament state ---
TOURNAMENT_STATE_ID = True  # single-row table keyed by boolean

# --- Golfer tier columns on teams table ---
TIER_GOLFER_COLS = (
    "tier1_golfer_id",
    "tier2a_golfer_id",
    "tier2b_golfer_id",
    "tier3_golfer_id",
    "tier4_golfer_id",
)

# --- Valid enum values (match CHECK constraints in SQL migration) ---
VALID_GOLFER_STATUSES = {
    "STATUS_IN_PROGRESS",
    "STATUS_FINAL",
    "STATUS_CUT",
    "STATUS_WITHDRAWN",
    "STATUS_DISQUALIFIED",
    "STATUS_SUSPENDED",
}

VALID_TOURNAMENT_STATUSES = {
    "pre_tournament",
    "in_progress",
    "suspended",
    "complete",
}

VALID_TEAM_STATUSES = {"active", "disqualified"}

VALID_PAYMENT_STATUSES = {"pending", "completed", "refunded"}

# Statuses that mean the golfer caused a team DQ
DQ_STATUSES = {"STATUS_WITHDRAWN", "STATUS_DISQUALIFIED"}

# --- Golfer select fields (common queries) ---
GOLFER_LIST_FIELDS = "id, name, world_rank, tier, score_to_par, position, thru, status, round_scores, total_strokes"
GOLFER_SCORE_FIELDS = "id, score_to_par, status"

# --- Team select fields ---
TEAM_LIST_FIELDS = (
    "id, team_name, total_score, status, payment_status, submitted_at, "
    + ", ".join(TIER_GOLFER_COLS)
)
