/**
 * Unified score pipeline for leaderboard, cron, and admin operations.
 *
 * This module provides a single source of truth for:
 * - Loading golfer scores from DB
 * - Loading completed teams from DB
 * - Calculating team totals and rankings
 * - Persisting recalculated team totals/statuses
 *
 * Used by:
 * - GET /api/leaderboard
 * - GET|POST /api/cron/update-scores
 * - POST /api/admin/update-score
 * - POST /api/admin/update-scores-bulk
 */

import { getSupabase } from "./db";
import {
  TABLE_GOLFERS,
  TABLE_TEAMS,
  TABLE_TOURNAMENT_STATE,
  TIER_GOLFER_COLS,
  GOLFER_SCORE_FIELDS,
  TOURNAMENT_STATE_ID,
} from "./schema";
import {
  rankTeams,
  checkTeamDisqualification,
  type GolferScoreData,
  type TeamForScoring,
  type ScoredTeam,
} from "./scoring";
import type { GolferStatus, Tier, LeaderboardTeam, LeaderboardGolfer } from "@/types";

// Team row from database
interface TeamRow {
  id: string;
  team_name: string;
  total_score: number | null;
  status: "active" | "disqualified";
  payment_status: string;
  submitted_at: string | null;
  contestant_id: string;
  tier1_golfer_id: string;
  tier2a_golfer_id: string;
  tier2b_golfer_id: string;
  tier3_golfer_id: string;
  tier4_golfer_id: string;
}

// Golfer row from database (for leaderboard display)
interface GolferRow {
  id: string;
  name: string;
  world_rank: number | null;
  tier: number | null;
  score_to_par: number | null;
  position: string | null;
  thru: number | null;
  status: GolferStatus;
  round_scores: (number | null)[] | null;
}

/**
 * Load all golfer scores from the database.
 */
export async function loadGolferScores(): Promise<Map<string, GolferScoreData>> {
  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_GOLFERS)
    .select(GOLFER_SCORE_FIELDS);

  if (error) {
    throw new Error(`Failed to load golfer scores: ${error.message}`);
  }

  const map = new Map<string, GolferScoreData>();
  for (const row of data || []) {
    map.set(row.id, {
      id: row.id,
      score_to_par: row.score_to_par,
      status: row.status as GolferStatus,
    });
  }
  return map;
}

/**
 * Load all golfers with full details for leaderboard display.
 */
export async function loadGolfersFull(): Promise<Map<string, GolferRow>> {
  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_GOLFERS)
    .select("id, name, world_rank, tier, score_to_par, position, thru, status, round_scores");

  if (error) {
    throw new Error(`Failed to load golfers: ${error.message}`);
  }

  const map = new Map<string, GolferRow>();
  for (const row of data || []) {
    map.set(row.id, row as GolferRow);
  }
  return map;
}

/**
 * Load all completed (paid) teams from the database.
 */
export async function loadCompletedTeams(): Promise<TeamRow[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_TEAMS)
    .select("id, team_name, total_score, status, payment_status, submitted_at, contestant_id, tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id, tier3_golfer_id, tier4_golfer_id")
    .eq("payment_status", "completed");

  if (error) {
    throw new Error(`Failed to load teams: ${error.message}`);
  }

  return (data || []) as unknown as TeamRow[];
}

/**
 * Convert a database team row to the scoring format.
 */
function teamRowToScoringFormat(row: TeamRow): TeamForScoring {
  return {
    id: row.id,
    golfers: [
      { golfer_id: row.tier1_golfer_id, tier: 1 as Tier },
      { golfer_id: row.tier2a_golfer_id, tier: 2 as Tier },
      { golfer_id: row.tier2b_golfer_id, tier: 2 as Tier },
      { golfer_id: row.tier3_golfer_id, tier: 3 as Tier },
      { golfer_id: row.tier4_golfer_id, tier: 4 as Tier },
    ],
  };
}

/**
 * Load contestant names for a list of contestant IDs.
 */
async function loadContestantNames(contestantIds: string[]): Promise<Map<string, string>> {
  if (contestantIds.length === 0) return new Map();

  const db = getSupabase();
  const { data, error } = await db
    .from("contestants")
    .select("id, name")
    .in("id", contestantIds);

  if (error) {
    throw new Error(`Failed to load contestants: ${error.message}`);
  }

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.id, row.name);
  }
  return map;
}

/**
 * Get the ranked leaderboard with full team and golfer details.
 * Uses pre-computed rankings for efficient database-level pagination.
 */
export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0,
  options: { includeAllTeams?: boolean } = {}
): Promise<{
  teams: LeaderboardTeam[];
  total: number;
  lastUpdated: string | null;
}> {
  const db = getSupabase();
  const { includeAllTeams = false } = options;

  // Get total count and last updated in parallel
  let countQuery = db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true });

  if (!includeAllTeams) {
    countQuery = countQuery.eq("payment_status", "completed");
  }

  const [countResult, tournamentState] = await Promise.all([
    countQuery,
    getTournamentLastUpdated(),
  ]);

  const total = countResult.count ?? 0;

  // Get paginated teams using pre-computed rank (from DB)
  let teamsQuery = db
    .from(TABLE_TEAMS)
    .select(`
      id, team_name, total_score, status, contestant_id, rank,
      tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id,
      tier3_golfer_id, tier4_golfer_id
    `);

  if (!includeAllTeams) {
    teamsQuery = teamsQuery.eq("payment_status", "completed");
  }

  const { data: teamRows, error: teamsError } = await teamsQuery
    .order("rank", { nullsFirst: false })
    .order("total_score", { nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (teamsError) {
    throw new Error(`Failed to load teams: ${teamsError.message}`);
  }

  if (!teamRows || teamRows.length === 0) {
    return { teams: [], total, lastUpdated: tournamentState };
  }

  // Collect golfer IDs only for the paginated teams
  const golferIds = new Set<string>();
  for (const team of teamRows) {
    for (const col of TIER_GOLFER_COLS) {
      const gid = team[col as keyof typeof team] as string | null;
      if (gid) golferIds.add(gid);
    }
  }

  // Collect contestant IDs for name lookup
  const contestantIds = [...new Set(teamRows.map((t) => t.contestant_id))];

  // Load golfers and contestants in parallel
  const [golfersResult, contestantNames] = await Promise.all([
    db
      .from(TABLE_GOLFERS)
      .select("id, name, world_rank, tier, score_to_par, thru, status, round_scores")
      .in("id", Array.from(golferIds)),
    loadContestantNames(contestantIds),
  ]);

  const golferMap = new Map<string, GolferRow>();
  for (const g of golfersResult.data || []) {
    golferMap.set(g.id, g as GolferRow);
  }

  // Build leaderboard response
  const leaderboardTeams: LeaderboardTeam[] = teamRows.map((teamRow) => {
    const contestantName = contestantNames.get(teamRow.contestant_id) || "Unknown";

    // Build golfer details with tier assignment
    const tierAssignments: Array<{ col: string; tier: Tier }> = [
      { col: "tier1_golfer_id", tier: 1 },
      { col: "tier2a_golfer_id", tier: 2 },
      { col: "tier2b_golfer_id", tier: 2 },
      { col: "tier3_golfer_id", tier: 3 },
      { col: "tier4_golfer_id", tier: 4 },
    ];

    const golfers: LeaderboardGolfer[] = tierAssignments.map(({ col, tier }) => {
      const golferId = teamRow[col as keyof typeof teamRow] as string;
      const golfer = golferMap.get(golferId);

      if (!golfer) {
        return {
          id: golferId,
          name: "Unknown",
          world_rank: null,
          tier,
          score_to_par: null,
          thru: null,
          status: "STATUS_IN_PROGRESS" as GolferStatus,
          round_scores: [],
        };
      }

      return {
        id: golfer.id,
        name: golfer.name,
        world_rank: golfer.world_rank,
        tier: golfer.tier as Tier,
        score_to_par: golfer.score_to_par,
        thru: golfer.thru,
        status: golfer.status,
        round_scores: golfer.round_scores || [],
      };
    });

    return {
      rank: teamRow.rank ?? 0,
      team_id: teamRow.id,
      team_name: teamRow.team_name,
      contestant_name: contestantName,
      total_score: teamRow.total_score,
      status: teamRow.status as "active" | "disqualified",
      golfers,
    };
  });

  return {
    teams: leaderboardTeams,
    total,
    lastUpdated: tournamentState,
  };
}

/**
 * Get the last score update timestamp from tournament state.
 */
async function getTournamentLastUpdated(): Promise<string | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_TOURNAMENT_STATE)
    .select("last_score_update")
    .eq("id", TOURNAMENT_STATE_ID)
    .single();

  if (error || !data) {
    return null;
  }

  return data.last_score_update;
}

/**
 * Update pre-computed rankings for all completed teams.
 * Calls the PostgreSQL function that uses window functions for efficient ranking.
 */
export async function updateTeamRankings(): Promise<void> {
  const db = getSupabase();
  const { error } = await db.rpc("update_team_rankings");

  if (error) {
    console.error(`Failed to update team rankings: ${error.message}`);
    throw new Error(`Failed to update team rankings: ${error.message}`);
  }
}

/**
 * Recalculate and persist scores for all completed teams.
 * Returns the number of teams updated.
 */
export async function recalculateAllTeams(): Promise<number> {
  const db = getSupabase();

  // Load current golfer scores
  const golferScores = await loadGolferScores();

  // Load all completed teams
  const teamRows = await loadCompletedTeams();

  let updatedCount = 0;

  for (const teamRow of teamRows) {
    const teamForScoring = teamRowToScoringFormat(teamRow);
    const isDisqualified = checkTeamDisqualification(teamForScoring, golferScores);

    // Calculate total score
    let totalScore: number | null = null;
    if (!isDisqualified) {
      totalScore = 0;
      for (const slot of teamForScoring.golfers) {
        const golfer = golferScores.get(slot.golfer_id);
        totalScore += golfer?.score_to_par ?? 0;
      }
    }

    const newStatus = isDisqualified ? "disqualified" : "active";

    // Only update if something changed
    if (teamRow.total_score !== totalScore || teamRow.status !== newStatus) {
      const { error } = await db
        .from(TABLE_TEAMS)
        .update({
          total_score: totalScore,
          status: newStatus,
        })
        .eq("id", teamRow.id);

      if (error) {
        console.error(`Failed to update team ${teamRow.id}: ${error.message}`);
      } else {
        updatedCount++;
      }
    }
  }

  return updatedCount;
}
