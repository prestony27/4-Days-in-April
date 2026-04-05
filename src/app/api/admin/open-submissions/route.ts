/**
 * POST /api/admin/open-submissions - Re-open submissions
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_TOURNAMENT_STATE, TOURNAMENT_STATE_ID } from "@/lib/schema";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const authResult = verifyAdminAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { detail: authResult.message },
      { status: authResult.status }
    );
  }

  const db = getSupabase();
  await db
    .from(TABLE_TOURNAMENT_STATE)
    .update({ submissions_open: true })
    .eq("id", TOURNAMENT_STATE_ID);

  return Response.json({ status: "submissions_opened" });
}
