/**
 * POST /api/admin/update-rankings - Update golfer world rankings and tiers
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_GOLFERS } from "@/lib/schema";

interface RankingUpdate {
  golfer_id: string;
  world_rank: number;
  tier: number;
}

interface RequestBody {
  golfers: RankingUpdate[];
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

  for (const g of body.golfers) {
    if (g.tier < 1 || g.tier > 4) {
      continue; // Skip invalid tier
    }

    const { error } = await db
      .from(TABLE_GOLFERS)
      .update({
        world_rank: g.world_rank,
        tier: g.tier,
      })
      .eq("id", g.golfer_id);

    if (!error) {
      updated++;
    }
  }

  return Response.json({ updated });
}
