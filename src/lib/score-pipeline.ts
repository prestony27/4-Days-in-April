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
 */
export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0
): Promise<{
  teams: LeaderboardTeam[];
  total: number;
  lastUpdated: string | null;
}> {
  // Load all data in parallel
  const [golferScores, golfersFull, teamRows, tournamentState] = await Promise.all([
    loadGolferScores(),
    loadGolfersFull(),
    loadCompletedTeams(),
    getTournamentLastUpdated(),
  ]);

  // Convert teams to scoring format and rank them
  const teamsForScoring = teamRows.map(teamRowToScoringFormat);
  const rankedTeams = rankTeams(teamsForScoring, golferScores);

  // Load contestant names
  const contestantIds = [...new Set(teamRows.map((t) => t.contestant_id))];
  const contestantNames = await loadContestantNames(contestantIds);

  // Create a map of team row data by ID
  const teamRowMap = new Map(teamRows.map((t) => [t.id, t]));

  // Build leaderboard response with pagination
  const paginatedTeams = rankedTeams.slice(offset, offset + limit);

  const leaderboardTeams: LeaderboardTeam[] = paginatedTeams.map((scored) => {
    const teamRow = teamRowMap.get(scored.team.id)!;
    const contestantName = contestantNames.get(teamRow.contestant_id) || "Unknown";

    // Build golfer details
    const golfers: LeaderboardGolfer[] = scored.team.golfers.map((slot) => {
      const golfer = golfersFull.get(slot.golfer_id);
      if (!golfer) {
        return {
          id: slot.golfer_id,
          name: "Unknown",
          world_rank: null,
          tier: slot.tier,
          score_to_par: null,
          thru: null,
          status: "STATUS_IN_PROGRESS",
          round_scores: [],
        };
      }
      return {
        id: golfer.id,
        name: golfer.name,
        world_rank: golfer.world_rank,
        tier: golfer.tier,
        score_to_par: golfer.score_to_par,
        thru: golfer.thru,
        status: golfer.status,
        round_scores: golfer.round_scores || [],
      };
    });

    return {
      rank: scored.rank ?? 0,
      team_id: scored.team.id,
      team_name: teamRow.team_name,
      contestant_name: contestantName,
      total_score: scored.totalScore,
      status: scored.isDisqualified ? "disqualified" : "active",
      golfers,
    };
  });

  return {
    teams: leaderboardTeams,
    total: rankedTeams.length,
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
