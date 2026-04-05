/**
 * GET /api/leaderboard - Ranked teams with golfer scores and tiebreakers
 */

import { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/score-pipeline";

export async function GET(request: NextRequest) {
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
