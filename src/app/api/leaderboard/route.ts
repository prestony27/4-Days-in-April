/**
 * GET /api/leaderboard - Ranked teams with golfer scores and tiebreakers
 *
 * Before deadline: Returns team names and contestant names (no golfer picks)
 * After deadline: Returns full leaderboard with golfer details and scores
 */

import { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/score-pipeline";
import { getSupabase } from "@/lib/db";
import { TABLE_TEAMS } from "@/lib/schema";
import { SUBMISSION_DEADLINE } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const now = new Date();

  // Before deadline: return team names only (hide golfer picks)
  // Show all submitted teams regardless of payment status - payment verification is manual
  if (now < SUBMISSION_DEADLINE) {
    const db = getSupabase();
    const { data: teams, count } = await db
      .from(TABLE_TEAMS)
      .select("id, team_name, submitted_at, contestants(name)", { count: "exact" })
      .order("submitted_at", { ascending: true });

    return Response.json(
      {
        teams: (teams || []).map((t) => {
          // Supabase returns related record as object (single) due to foreign key
          const contestant = t.contestants as unknown as { name: string } | null;
          return {
            team_id: t.id,
            team_name: t.team_name,
            contestant_name: contestant?.name || "Unknown",
            // No rank, total_score, status, or golfers - hidden until deadline
          };
        }),
        total: count || 0,
        locked: false,
        unlocks_at: SUBMISSION_DEADLINE.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  }

  const searchParams = request.nextUrl.searchParams;

  // Parse pagination params with defaults and bounds
  let limit = parseInt(searchParams.get("limit") || "50", 10);
  let offset = parseInt(searchParams.get("offset") || "0", 10);

  // Validate bounds
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 500) limit = 500;
  if (isNaN(offset) || offset < 0) offset = 0;

  try {
    const { teams, total, lastUpdated } = await getLeaderboard(limit, offset);

    return Response.json(
      {
        teams,
        total,
        last_updated: lastUpdated,
        locked: true,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Leaderboard error:", error);
    return Response.json(
      { detail: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
