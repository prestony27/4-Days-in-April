/**
 * GET /api/golfers - List all golfers with optional tier filter
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_GOLFERS, GOLFER_LIST_FIELDS } from "@/lib/schema";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tierParam = searchParams.get("tier");

  const db = getSupabase();
  let query = db
    .from(TABLE_GOLFERS)
    .select(GOLFER_LIST_FIELDS)
    .order("world_rank");

  // Handle optional tier filter
  if (tierParam) {
    // Accept both "1" and "tier1" formats
    const tierStr = tierParam.toLowerCase().replace("tier", "").trim();
    const tierNum = parseInt(tierStr, 10);

    if (isNaN(tierNum) || tierNum < 1 || tierNum > 4) {
      return Response.json(
        { detail: "Invalid tier. Use 1, 2, 3, or 4." },
        { status: 400 }
      );
    }

    query = query.eq("tier", tierNum);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Database error:", error);
    return Response.json(
      { detail: "Database error" },
      { status: 500 }
    );
  }

  return Response.json(
    { golfers: data || [], count: data?.length || 0 },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
