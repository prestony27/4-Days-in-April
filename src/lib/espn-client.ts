/**
 * ESPN Golf API client for fetching live leaderboard data.
 *
 * Uses DB-backed throttling to coordinate across serverless instances.
 * Only the cron job should call ESPN; this prevents instances from
 * independently bypassing the rate limit.
 */

import { getSupabase } from "./db";
import { TABLE_TOURNAMENT_STATE, TOURNAMENT_STATE_ID } from "./schema";
import type { GolferStatus, TournamentStatus } from "@/types";

// ESPN tournament IDs
export const MASTERS_2026_ID = "401811941";
export const VALERO_TEXAS_OPEN_2026_ID = "401811940";

export const ESPN_LEADERBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard";

// Minimum seconds between ESPN requests (DB-backed coordination)
export const MIN_REQUEST_INTERVAL_SECONDS = 120;

// Map ESPN status strings to our status types
const ESPN_STATUS_MAP: Record<string, GolferStatus> = {
  STATUS_IN_PROGRESS: "STATUS_IN_PROGRESS",
  STATUS_FINAL: "STATUS_FINAL",
  STATUS_CUT: "STATUS_CUT",
  STATUS_WITHDRAWN: "STATUS_WITHDRAWN",
  STATUS_DISQUALIFIED: "STATUS_DISQUALIFIED",
  STATUS_SUSPENDED: "STATUS_SUSPENDED",
};

const ESPN_TOURNAMENT_STATUS_MAP: Record<string, TournamentStatus> = {
  STATUS_SCHEDULED: "pre_tournament",
  STATUS_IN_PROGRESS: "in_progress",
  STATUS_SUSPENDED: "suspended",
  STATUS_FINAL: "complete",
};

// Golfer score data from ESPN
export interface ESPNGolferScore {
  espnId: string;
  name: string;
  position: string | null;
  scoreToPar: number | null;
  thru: number | null;
  status: GolferStatus;
  roundScores: (number | null)[];
  totalStrokes: number | null;
}

// Tournament state from ESPN
export interface ESPNTournamentState {
  currentRound: number;
  tournamentStatus: TournamentStatus;
  submissionsOpen: boolean;
}

/**
 * Check if we can make an ESPN request (DB-backed rate limiting).
 * Returns true if allowed, false if should wait.
 */
export async function canFetchESPN(): Promise<boolean> {
  const db = getSupabase();
  const { data } = await db
    .from(TABLE_TOURNAMENT_STATE)
    .select("last_score_update")
    .eq("id", TOURNAMENT_STATE_ID)
    .single();

  if (!data?.last_score_update) {
    return true; // No previous fetch recorded
  }

  const lastFetch = new Date(data.last_score_update);
  const now = new Date();
  const elapsedSeconds = (now.getTime() - lastFetch.getTime()) / 1000;

  return elapsedSeconds >= MIN_REQUEST_INTERVAL_SECONDS;
}

/**
 * Record that an ESPN fetch was made (update last_score_update).
 */
export async function recordESPNFetch(): Promise<void> {
  const db = getSupabase();
  await db
    .from(TABLE_TOURNAMENT_STATE)
    .update({ last_score_update: new Date().toISOString() })
    .eq("id", TOURNAMENT_STATE_ID);
}

/**
 * Fetch raw ESPN event data.
 */
async function fetchESPNEvent(tournamentId: string): Promise<ESPNEvent> {
  const url = `${ESPN_LEADERBOARD_URL}?event=${tournamentId}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "MastersPool/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const events = data.events || [];

  if (events.length === 0) {
    throw new Error(`No event data returned for tournament ${tournamentId}`);
  }

  return events[0];
}

// ESPN event structure (simplified)
interface ESPNEvent {
  status?: {
    type?: {
      name?: string;
    };
  };
  competitions?: Array<{
    competitors?: ESPNCompetitor[];
  }>;
  competitors?: ESPNCompetitor[];
}

interface ESPNCompetitor {
  id?: string;
  athlete?: {
    id?: string;
    displayName?: string;
  };
  status?: {
    type?: {
      name?: string;
    };
    position?: {
      displayName?: string;
    };
    thru?: number;
    period?: number;
  };
  statistics?: Array<{
    name?: string;
    value?: number;
  }>;
  linescores?: Array<{
    value?: number;
  }>;
  score?: {
    value?: number;
  };
}

/**
 * Extract competitors from event, handling ESPN's nested structure.
 */
function getCompetitors(event: ESPNEvent): ESPNCompetitor[] {
  const competitions = event.competitions || [];
  if (competitions.length > 0) {
    return competitions[0].competitors || [];
  }
  return event.competitors || [];
}

/**
 * Parse a single ESPN competitor into our GolferScore format.
 */
function parseCompetitor(comp: ESPNCompetitor): ESPNGolferScore {
  const athlete = comp.athlete || {};
  const status = comp.status || {};
  const statusType = status.type || {};

  // Score to par from statistics
  let scoreToPar: number | null = null;
  for (const stat of comp.statistics || []) {
    if (stat.name === "scoreToPar" && stat.value !== undefined) {
      scoreToPar = Math.round(stat.value);
      break;
    }
  }

  // Round scores from linescores
  const roundScores: (number | null)[] = [];
  for (const ls of comp.linescores || []) {
    if (ls.value !== undefined && ls.value > 0) {
      roundScores.push(Math.round(ls.value));
    } else {
      roundScores.push(null);
    }
  }

  // Total strokes
  let totalStrokes: number | null = null;
  if (comp.score?.value !== undefined) {
    totalStrokes = Math.round(comp.score.value);
  }

  // Thru holes
  let thru: number | null = null;
  if (status.thru !== undefined) {
    thru = status.thru;
  }

  // Position
  const position = status.position?.displayName || null;

  // ESPN status -> our status
  const espnStatus = statusType.name || "STATUS_IN_PROGRESS";
  const golferStatus = ESPN_STATUS_MAP[espnStatus] || "STATUS_IN_PROGRESS";

  return {
    espnId: String(athlete.id || comp.id || ""),
    name: athlete.displayName || "Unknown",
    position,
    scoreToPar,
    thru,
    status: golferStatus,
    roundScores,
    totalStrokes,
  };
}

/**
 * Fetch leaderboard data from ESPN.
 * This should only be called from the cron job.
 */
export async function getLeaderboard(
  tournamentId: string
): Promise<ESPNGolferScore[]> {
  const event = await fetchESPNEvent(tournamentId);
  const competitors = getCompetitors(event);

  const golfers: ESPNGolferScore[] = [];
  let parseFailures = 0;

  for (const comp of competitors) {
    try {
      const golfer = parseCompetitor(comp);
      golfers.push(golfer);
    } catch (error) {
      parseFailures++;
      const name = comp.athlete?.displayName || "unknown";
      console.error(`Failed to parse competitor: ${name}`, error);
    }
  }

  if (parseFailures > 0) {
    console.error(
      `ESPN parse: ${parseFailures}/${competitors.length} competitors failed to parse`
    );
  }

  return golfers;
}

/**
 * Fetch tournament state from ESPN.
 */
export async function getTournamentState(
  tournamentId: string
): Promise<ESPNTournamentState> {
  const event = await fetchESPNEvent(tournamentId);

  const eventStatus = event.status || {};
  const statusName = eventStatus.type?.name || "STATUS_SCHEDULED";
  const tournamentStatus =
    ESPN_TOURNAMENT_STATUS_MAP[statusName] || "pre_tournament";

  // Determine current round from competitor data
  let currentRound = 0;
  const competitors = getCompetitors(event);

  for (const comp of competitors) {
    const compStatus = comp.status || {};
    const period = compStatus.period;

    if (period !== undefined && period > currentRound) {
      currentRound = period;
    }

    // If we find an active player, the round number is reliable
    if (compStatus.type?.name === "STATUS_IN_PROGRESS") {
      break;
    }
  }

  return {
    currentRound,
    tournamentStatus,
    submissionsOpen: tournamentStatus === "pre_tournament",
  };
}
