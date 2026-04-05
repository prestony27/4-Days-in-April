/**
 * GET /api/leaderboard - Ranked teams with golfer scores and tiebreakers
 *
 * Only returns data after the submission deadline has passed.
 */

import { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/score-pipeline";
import { SUBMISSION_DEADLINE } from "@/lib/validation";

export async function GET(request: NextRequest) {
  // Don't expose leaderboard until submissions are closed
  const now = new Date();
  if (now < SUBMISSION_DEADLINE) {
    return Response.json(
      {
        teams: [],
        total: 0,
        last_updated: now.toISOString(),
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
