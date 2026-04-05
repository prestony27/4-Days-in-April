/**
 * Single source of truth for database schema constants.
 * All table names, column names, and valid enum values live here.
 */

// --- Table names ---
export const TABLE_GOLFERS = "golfers";
export const TABLE_CONTESTANTS = "contestants";
export const TABLE_TEAMS = "teams";
export const TABLE_TOURNAMENT_STATE = "tournament_state";

// --- Tournament state ---
export const TOURNAMENT_STATE_ID = true; // single-row table keyed by boolean

// --- Golfer tier columns on teams table ---
export const TIER_GOLFER_COLS = [
  "tier1_golfer_id",
  "tier2a_golfer_id",
  "tier2b_golfer_id",
  "tier3_golfer_id",
  "tier4_golfer_id",
] as const;

// --- Valid enum values (match CHECK constraints in SQL migration) ---
export const VALID_GOLFER_STATUSES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_FINAL",
  "STATUS_CUT",
  "STATUS_WITHDRAWN",
  "STATUS_DISQUALIFIED",
  "STATUS_SUSPENDED",
]);

export const VALID_TOURNAMENT_STATUSES = new Set([
  "pre_tournament",
  "in_progress",
  "suspended",
  "complete",
]);

export const VALID_TEAM_STATUSES = new Set(["active", "disqualified"]);

export const VALID_PAYMENT_STATUSES = new Set(["pending", "completed", "refunded"]);

// Statuses that mean the golfer caused a team DQ
export const DQ_STATUSES = new Set(["STATUS_WITHDRAWN", "STATUS_DISQUALIFIED"]);

// --- Golfer select fields (common queries) ---
export const GOLFER_LIST_FIELDS =
  "id, name, world_rank, tier, score_to_par, position, thru, status, round_scores, total_strokes";
export const GOLFER_SCORE_FIELDS = "id, score_to_par, status";

// --- Team select fields ---
export const TEAM_LIST_FIELDS = `id, team_name, total_score, status, payment_status, submitted_at, ${TIER_GOLFER_COLS.join(", ")}`;
