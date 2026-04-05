/**
 * POST /api/admin/upsert-golfers - Add or update golfers (pre-tournament field management)
 *
 * Handles:
 * - Updating existing golfers (by ID) - only updates name, world_rank, tier
 * - Adding new golfers
 * - Both in a single request
 *
 * Preserves scoring data (score_to_par, thru, position, etc.) for existing golfers.
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_GOLFERS } from "@/lib/schema";

interface GolferUpsert {
  id: string;
  name: string;
  world_rank: number;
  tier: number;
}

interface RequestBody {
  golfers: GolferUpsert[];
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
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.golfers)) {
    return Response.json(
      { detail: "golfers must be an array" },
      { status: 422 }
    );
  }

  if (body.golfers.length === 0) {
    return Response.json(
      { detail: "golfers array cannot be empty" },
      { status: 422 }
    );
  }

  // Validate each golfer
  const validationErrors: string[] = [];
  for (let i = 0; i < body.golfers.length; i++) {
    const g = body.golfers[i];

    if (!g.id || typeof g.id !== "string" || g.id.trim() === "") {
      validationErrors.push(`golfers[${i}]: id is required and must be a non-empty string`);
    }
    if (!g.name || typeof g.name !== "string" || g.name.trim() === "") {
      validationErrors.push(`golfers[${i}]: name is required and must be a non-empty string`);
    }
    if (typeof g.world_rank !== "number" || g.world_rank < 1) {
      validationErrors.push(`golfers[${i}]: world_rank must be a positive integer`);
    }
    if (typeof g.tier !== "number" || g.tier < 1 || g.tier > 4) {
      validationErrors.push(`golfers[${i}]: tier must be 1, 2, 3, or 4`);
    }
  }

  if (validationErrors.length > 0) {
    return Response.json(
      { detail: "Validation errors", errors: validationErrors },
      { status: 422 }
    );
  }

  const db = getSupabase();

  // Get existing golfer IDs to track created vs updated
  const golferIds = body.golfers.map((g) => g.id);
  const { data: existingGolfers } = await db
    .from(TABLE_GOLFERS)
    .select("id")
    .in("id", golferIds);

  const existingIds = new Set((existingGolfers || []).map((g) => g.id));

  // Perform upsert - only update name, world_rank, tier, updated_at
  // Scoring fields are preserved for existing golfers via onConflict
  const upsertData = body.golfers.map((g) => ({
    id: g.id.trim(),
    name: g.name.trim(),
    world_rank: g.world_rank,
    tier: g.tier,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await db
    .from(TABLE_GOLFERS)
    .upsert(upsertData, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("Upsert golfers error:", error);
    return Response.json(
      { detail: `Database error: ${error.message}` },
      { status: 500 }
    );
  }

  // Count created vs updated
  const createdCount = body.golfers.filter((g) => !existingIds.has(g.id)).length;
  const updatedCount = body.golfers.filter((g) => existingIds.has(g.id)).length;

  return Response.json({
    created: createdCount,
    updated: updatedCount,
    total: body.golfers.length,
  });
}
