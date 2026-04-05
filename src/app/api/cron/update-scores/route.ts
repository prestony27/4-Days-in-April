/**
 * GET/POST /api/cron/update-scores - Fetch ESPN scores and update database
 *
 * Called by Vercel Cron (every 2 minutes during tournament).
 * Must support both GET and POST for compatibility.
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyCronAuth } from "@/lib/auth";
import {
  TABLE_GOLFERS,
  TABLE_TOURNAMENT_STATE,
  TOURNAMENT_STATE_ID,
} from "@/lib/schema";
import {
  getLeaderboard,
  getTournamentState,
  MASTERS_2026_ID,
  canFetchESPN,
  recordESPNFetch,
} from "@/lib/espn-client";
import { recalculateAllTeams } from "@/lib/score-pipeline";

async function handleUpdateScores(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const authResult = verifyCronAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { detail: authResult.message },
      { status: authResult.status }
    );
  }

  // Check rate limiting (DB-backed coordination)
  const canFetch = await canFetchESPN();
  if (!canFetch) {
    return Response.json(
      { detail: "Rate limited - please wait before fetching again" },
      { status: 429 }
    );
  }

  const db = getSupabase();

  // Fetch live scores from ESPN
  let golferScores;
  let tournamentState;
  try {
    golferScores = await getLeaderboard(MASTERS_2026_ID);
    tournamentState = await getTournamentState(MASTERS_2026_ID);
    await recordESPNFetch(); // Record successful fetch for rate limiting
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("ESPN API fetch failed:", message);
    return Response.json(
      { detail: `ESPN API error: ${message}` },
      { status: 502 }
    );
  }

  // Update tournament state (single-row table keyed by boolean true)
  await db.from(TABLE_TOURNAMENT_STATE).upsert({
    id: TOURNAMENT_STATE_ID,
    current_round: tournamentState.currentRound,
    tournament_status: tournamentState.tournamentStatus,
    submissions_open: tournamentState.submissionsOpen,
    last_score_update: new Date().toISOString(),
  });

  // Get existing golfer map (match by name since ESPN IDs might differ from seeded IDs)
  const { data: existingGolfers } = await db
    .from(TABLE_GOLFERS)
    .select("id, name");

  const nameToDbId = new Map<string, string>();
  for (const g of existingGolfers || []) {
    nameToDbId.set(g.name.toLowerCase().trim(), g.id);
  }

  // Update golfer scores in DB
  let updatedCount = 0;
  for (const gs of golferScores) {
    const dbId = nameToDbId.get(gs.name.toLowerCase().trim());
    if (!dbId) {
      console.log(`Golfer not in DB (not in field?): ${gs.name}`);
      continue;
    }

    const { error } = await db
      .from(TABLE_GOLFERS)
      .update({
        score_to_par: gs.scoreToPar,
        position: gs.position,
        thru: gs.thru,
        status: gs.status,
        round_scores: gs.roundScores,
        total_strokes: gs.totalStrokes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dbId);

    if (!error) {
      updatedCount++;
    }
  }

  // Recalculate team scores using shared pipeline
  const teamsUpdated = await recalculateAllTeams();

  return Response.json({
    golfers_updated: updatedCount,
    teams_recalculated: teamsUpdated,
    tournament_round: tournamentState.currentRound,
    tournament_status: tournamentState.tournamentStatus,
  });
}

// Support both GET and POST for Vercel Cron compatibility
export async function GET(request: NextRequest) {
  return handleUpdateScores(request);
}

export async function POST(request: NextRequest) {
  return handleUpdateScores(request);
}
