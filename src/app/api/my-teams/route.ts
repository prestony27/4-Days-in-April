/**
 * GET /api/my-teams?email=... - All teams for a given email address
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_CONTESTANTS, TABLE_TEAMS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // Rate limiting: 15/minute
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(`my-teams:${ip}`, RATE_LIMITS.myTeams.limit, RATE_LIMITS.myTeams.windowMs);
  if (rateCheck.limited) {
    return rateLimitResponse();
  }

  const searchParams = request.nextUrl.searchParams;
  const emailParam = searchParams.get("email");

  if (!emailParam) {
    return Response.json(
      { detail: "Missing email parameter" },
      { status: 400 }
    );
  }

  // Normalize email for consistent lookup
  const email = emailParam.toLowerCase().trim();

  const db = getSupabase();

  // Find contestant
  const { data: contestantData } = await db
    .from(TABLE_CONTESTANTS)
    .select("id, name")
    .eq("email", email)
    .single();

  if (!contestantData) {
    return Response.json(
      { teams: [], count: 0 },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }

  // Get their teams
  const { data: teamsData } = await db
    .from(TABLE_TEAMS)
    .select("id, team_name, total_score, status, payment_status, submitted_at, tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id, tier3_golfer_id, tier4_golfer_id")
    .eq("contestant_id", contestantData.id)
    .order("submitted_at");

  if (!teamsData || teamsData.length === 0) {
    return Response.json(
      { teams: [], count: 0 },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }

  // Collect all golfer IDs across all teams
  const allGolferIds: string[] = [];
  for (const team of teamsData) {
    for (const col of TIER_GOLFER_COLS) {
      const golferId = team[col as keyof typeof team] as string | null;
      if (golferId) {
        allGolferIds.push(golferId);
      }
    }
  }

  // Fetch golfer details in one query
  const golferMap = new Map<string, Record<string, unknown>>();
  if (allGolferIds.length > 0) {
    const uniqueIds = [...new Set(allGolferIds)];
    const { data: golfersData } = await db
      .from(TABLE_GOLFERS)
      .select("id, name, world_rank, tier, score_to_par, thru, status")
      .in("id", uniqueIds);

    for (const g of golfersData || []) {
      golferMap.set(g.id, g);
    }
  }

  // Assemble response
  const teams = teamsData.map((team) => {
    const teamGolferIds: string[] = [];
    for (const col of TIER_GOLFER_COLS) {
      const golferId = team[col as keyof typeof team] as string | null;
      if (golferId) {
        teamGolferIds.push(golferId);
      }
    }

    const teamGolfers = teamGolferIds
      .map((gid) => golferMap.get(gid))
      .filter((g): g is Record<string, unknown> => g !== undefined);

    return {
      id: team.id,
      team_name: team.team_name,
      contestant_name: contestantData.name,
      total_score: team.total_score,
      status: team.status,
      payment_status: team.payment_status,
      golfers: teamGolfers,
      submitted_at: team.submitted_at,
    };
  });

  return Response.json(
    { teams, count: teams.length },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
