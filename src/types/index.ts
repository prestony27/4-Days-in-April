/** Frontend types mirroring backend Pydantic models. */

export type GolferStatus =
  | "STATUS_IN_PROGRESS"
  | "STATUS_FINAL"
  | "STATUS_CUT"
  | "STATUS_WITHDRAWN"
  | "STATUS_DISQUALIFIED"
  | "STATUS_SUSPENDED";

export type TournamentStatus =
  | "pre_tournament"
  | "in_progress"
  | "suspended"
  | "complete";

export type PaymentStatus = "pending" | "completed" | "refunded";
export type TeamStatus = "active" | "disqualified";

export type Tier = 1 | 2 | 3 | 4;

export interface Golfer {
  id: string;
  name: string;
  world_rank: number;
  tier: Tier;
}

export interface GolferScore {
  id: string;
  name: string;
  world_rank: number | null;
  tier: Tier | null;
  position: string | null;
  score_to_par: number | null;
  thru: number | null;
  status: GolferStatus;
  round_scores: (number | null)[];
  total_strokes: number | null;
  updated_at: string;
}

export interface TeamGolferSlot {
  golfer_id: string;
  golfer_name: string;
  tier: Tier;
}

export interface Team {
  id: string;
  contestant_id: string;
  team_name: string;
  golfers: TeamGolferSlot[];
  total_score: number | null;
  status: TeamStatus;
  payment_status: PaymentStatus;
  submitted_at: string;
}

export interface LeaderboardGolfer {
  id: string;
  name: string;
  world_rank: number | null;
  tier: number | null;
  score_to_par: number | null;
  thru: number | null;
  status: string;
  round_scores: (number | null)[];
}

export interface LeaderboardTeam {
  rank: number;
  team_id: string;
  team_name: string;
  contestant_name: string;
  total_score: number | null;
  status: "active" | "disqualified";
  golfers: LeaderboardGolfer[];
}

export interface LeaderboardResponse {
  teams: LeaderboardTeam[];
  total: number;
  last_updated: string | null;
}

export interface TournamentState {
  current_round: number;
  tournament_status: TournamentStatus;
  submissions_open: boolean;
  cut_line: number | null;
  last_score_update: string | null;
}

export interface TierConfig {
  tier: Tier;
  label: string;
  rankRange: string;
  pickCount: number;
}

export const TIER_CONFIGS: TierConfig[] = [
  { tier: 1, label: "Tier 1", rankRange: "1-10", pickCount: 1 },
  { tier: 2, label: "Tier 2", rankRange: "11-30", pickCount: 2 },
  { tier: 3, label: "Tier 3", rankRange: "31-50", pickCount: 1 },
  { tier: 4, label: "Tier 4", rankRange: "51+", pickCount: 1 },
];

export const ENTRY_FEE = 30;
export const MAX_TEAMS = 3;
export const SUBMISSION_DEADLINE = new Date("2026-04-09T05:00:00-04:00"); // 5 AM EDT (April = EDT)
export const TOURNAMENT_START = new Date("2026-04-09T08:00:00-04:00");
export const TOURNAMENT_END = new Date("2026-04-12T20:00:00-04:00");
