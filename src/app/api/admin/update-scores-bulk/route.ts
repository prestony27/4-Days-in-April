/**
 * POST /api/admin/update-scores-bulk - Manually update multiple golfer scores (ESPN fallback)
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_GOLFERS, TABLE_TOURNAMENT_STATE, TOURNAMENT_STATE_ID, VALID_GOLFER_STATUSES } from "@/lib/schema";
import { recalculateAllTeams } from "@/lib/score-pipeline";

interface ScoreUpdate {
  golfer_id: string;
  score_to_par?: number | null;
  thru?: number | null;
  status?: string | null;
  round_scores?: (number | null)[] | null;
  position?: string | null;
  total_strokes?: number | null;
}

interface RequestBody {
  golfers: ScoreUpdate[];
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const authResult = verifyAdminAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { detail: authResult.message },
      { status: authResult.status }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.golfers)) {
    return Response.json({ detail: "golfers must be an array" }, { status: 422 });
  }

  const db = getSupabase();
  let updated = 0;
  const errors: Array<{ golfer_id: string; error: string }> = [];

  for (const g of body.golfers) {
    if (!g.golfer_id) {
      continue;
    }

    if (g.status && !VALID_GOLFER_STATUSES.has(g.status)) {
      errors.push({ golfer_id: g.golfer_id, error: `Invalid status: ${g.status}` });
      continue;
    }

    // Build update data (only include non-undefined fields)
    const updateData: Record<string, unknown> = {};
    if (g.score_to_par !== undefined) updateData.score_to_par = g.score_to_par;
    if (g.thru !== undefined) updateData.thru = g.thru;
    if (g.status !== undefined) updateData.status = g.status;
    if (g.round_scores !== undefined) updateData.round_scores = g.round_scores;
    if (g.position !== undefined) updateData.position = g.position;
    if (g.total_strokes !== undefined) updateData.total_strokes = g.total_strokes;

    if (Object.keys(updateData).length === 0) {
      continue;
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await db
      .from(TABLE_GOLFERS)
      .update(updateData)
      .eq("id", g.golfer_id);

    if (!error) {
      updated++;
    }
  }

  // Update tournament state timestamp and recalculate teams if any updates succeeded
  let teamsRecalculated = 0;
  if (updated > 0) {
    await db
      .from(TABLE_TOURNAMENT_STATE)
      .update({ last_score_update: new Date().toISOString() })
      .eq("id", TOURNAMENT_STATE_ID);

    // Recalculate team scores using shared pipeline
    teamsRecalculated = await recalculateAllTeams();
  }

  return Response.json({
    updated,
    teams_recalculated: teamsRecalculated,
    errors,
  });
}
