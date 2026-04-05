/**
 * POST /api/admin/seed-golfers - Seed golfer data for the tournament field
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_GOLFERS } from "@/lib/schema";

interface GolferCreate {
  id: string; // ESPN athlete ID
  name: string;
  world_rank: number;
  tier: number;
}

interface RequestBody {
  golfers: GolferCreate[];
}

export async function POST(request: NextRequest) {
  // Verify admin authorization
  const authHeader = request.headers.get("authorization");
  const authResult = verifyAdminAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { detail: authResult.message },
      { status: authResult.status }
    );
  }

  // Parse request body
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.golfers)) {
    return Response.json(
      { detail: "golfers must be an array" },
      { status: 422 }
    );
  }

  // Validate each golfer
  for (const g of body.golfers) {
    if (!g.id || !g.name || g.world_rank === undefined || g.tier === undefined) {
      return Response.json(
        { detail: "Each golfer must have id, name, world_rank, and tier" },
        { status: 422 }
      );
    }
    if (g.tier < 1 || g.tier > 4) {
      return Response.json(
        { detail: "tier must be 1, 2, 3, or 4" },
        { status: 422 }
      );
    }
  }

  const db = getSupabase();
  const { data, error } = await db.from(TABLE_GOLFERS).insert(body.golfers).select();

  if (error) {
    console.error("Seed golfers error:", error);
    return Response.json(
      { detail: `Database error: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({ created: data?.length || 0 });
}
