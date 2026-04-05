/**
 * GET /api/golfers/[id] - Get a single golfer by ID
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_GOLFERS } from "@/lib/schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_GOLFERS)
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return Response.json(
      { detail: "Golfer not found" },
      { status: 404 }
    );
  }

  return Response.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
