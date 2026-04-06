/**
 * GET /api/teams/[id] - Get a single team by ID
 *
 * Returns teams regardless of payment status (pending teams are now allowed
 * since payment verification is manual via Venmo)
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_TEAMS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const db = getSupabase();

  // Fetch team with contestant name (includes pending teams for Venmo payment flow)
  const { data: teamData, error: teamError } = await db
    .from(TABLE_TEAMS)
    .select("*, contestants(name, email)")
    .eq("id", id)
    .single();

  if (teamError || !teamData) {
    return Response.json(
      { detail: "Team not found" },
      { status: 404 }
    );
  }

  // Collect golfer IDs from tier columns
  const golferIds: string[] = [];
  for (const col of TIER_GOLFER_COLS) {
    const golferId = teamData[col as keyof typeof teamData];
    if (golferId) {
      golferIds.push(golferId as string);
    }
  }

  // Fetch golfer details
  const { data: golfersData } = await db
    .from(TABLE_GOLFERS)
    .select("id, name, world_rank, tier, score_to_par, thru, status, round_scores")
    .in("id", golferIds);

  const contestant = teamData.contestants as { name?: string } | null;

  return Response.json(
    {
      id: teamData.id,
      team_name: teamData.team_name,
      contestant_name: contestant?.name || null,
      total_score: teamData.total_score,
      status: teamData.status,
      payment_status: teamData.payment_status,
      golfers: golfersData || [],
      submitted_at: teamData.submitted_at,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
