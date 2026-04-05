/**
 * POST /api/admin/update-score - Manually update a single golfer's score (ESPN fallback)
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_GOLFERS, TABLE_TOURNAMENT_STATE, TOURNAMENT_STATE_ID, VALID_GOLFER_STATUSES } from "@/lib/schema";

interface ScoreUpdate {
  golfer_id: string;
  score_to_par?: number | null;
  thru?: number | null;
  status?: string | null;
  round_scores?: (number | null)[] | null;
  position?: string | null;
  total_strokes?: number | null;
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

  let body: ScoreUpdate;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.golfer_id) {
    return Response.json({ detail: "golfer_id is required" }, { status: 422 });
  }

  if (body.status && !VALID_GOLFER_STATUSES.has(body.status)) {
    return Response.json(
      { detail: `Invalid status. Must be one of: ${[...VALID_GOLFER_STATUSES].join(", ")}` },
      { status: 422 }
    );
  }

  // Build update data (only include non-undefined fields)
  const updateData: Record<string, unknown> = {};
  if (body.score_to_par !== undefined) updateData.score_to_par = body.score_to_par;
  if (body.thru !== undefined) updateData.thru = body.thru;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.round_scores !== undefined) updateData.round_scores = body.round_scores;
  if (body.position !== undefined) updateData.position = body.position;
  if (body.total_strokes !== undefined) updateData.total_strokes = body.total_strokes;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ detail: "No fields to update" }, { status: 422 });
  }

  updateData.updated_at = new Date().toISOString();

  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_GOLFERS)
    .update(updateData)
    .eq("id", body.golfer_id)
    .select();

  if (error || !data || data.length === 0) {
    return Response.json(
      { detail: `Golfer ${body.golfer_id} not found` },
      { status: 404 }
    );
  }

  // Update tournament state timestamp
  await db
    .from(TABLE_TOURNAMENT_STATE)
    .update({ last_score_update: new Date().toISOString() })
    .eq("id", TOURNAMENT_STATE_ID);

  return Response.json({ updated: body.golfer_id });
}
