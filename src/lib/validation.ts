/**
 * Team submission validation: tiers, duplicates, deadline, max teams.
 *
 * Preserves exact behavior from Python lib/validation.py including:
 * - Error messages and field names
 * - Validation order
 * - All edge cases
 */

import { getSupabase } from "./db";
import {
  TABLE_GOLFERS,
  TABLE_CONTESTANTS,
  TABLE_TEAMS,
  TABLE_TOURNAMENT_STATE,
  TIER_GOLFER_COLS,
  TOURNAMENT_STATE_ID,
} from "./schema";
import type { Tier } from "@/types";

// Deadline: 5:00 AM America/New_York, Thursday April 9, 2026
// In UTC: 9:00 AM (EDT = UTC-4 in April)
export const SUBMISSION_DEADLINE = new Date("2026-04-09T05:00:00-04:00");

export const MAX_TEAMS_PER_EMAIL = 3;

// Tier -> required WGR range [min, max]
export const TIER_RANK_RANGES: Record<Tier, [number, number]> = {
  1: [1, 10],
  2: [11, 30],
  3: [31, 50],
  4: [51, 999],
};

// Tier -> how many picks from that tier
export const TIER_PICK_COUNTS: Record<Tier, number> = {
  1: 1,
  2: 2,
  3: 1,
  4: 1,
};

/**
 * Custom validation error with message and optional field name.
 * Matches the Python ValidationError class.
 */
export class ValidationError extends Error {
  field: string | null;

  constructor(message: string, field: string | null = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/**
 * Check if submissions are open (deadline and manual override).
 */
export async function checkSubmissionsOpen(): Promise<void> {
  const now = new Date();

  if (now >= SUBMISSION_DEADLINE) {
    throw new ValidationError(
      "Submissions are closed. The deadline was 5:00 AM EST, April 9th."
    );
  }

  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_TOURNAMENT_STATE)
    .select("submissions_open")
    .eq("id", TOURNAMENT_STATE_ID)
    .single();

  if (error) {
    // If no tournament state exists, allow submissions
    return;
  }

  if (data && !data.submissions_open) {
    throw new ValidationError("Submissions have been manually closed.");
  }
}

/**
 * Validate each golfer is in the correct tier based on world_rank.
 */
export function validateTierPlacement(
  golferPicks: Array<{ golfer_id: string; tier: Tier; name: string; world_rank: number }>
): void {
  for (const pick of golferPicks) {
    const [low, high] = TIER_RANK_RANGES[pick.tier];
    if (pick.world_rank < low || pick.world_rank > high) {
      throw new ValidationError(
        `Golfer '${pick.name}' (rank ${pick.world_rank}) does not belong in Tier ${pick.tier} (ranks ${low}-${high}).`,
        "golfers"
      );
    }
  }
}

/**
 * Validate correct number of golfers per tier: 1 T1, 2 T2, 1 T3, 1 T4.
 */
export function validateTierComposition(
  golferPicks: Array<{ tier: Tier }>
): void {
  if (golferPicks.length !== 5) {
    throw new ValidationError("A team must have exactly 5 golfers.", "golfers");
  }

  const tierCounts: Record<number, number> = {};
  for (const pick of golferPicks) {
    tierCounts[pick.tier] = (tierCounts[pick.tier] || 0) + 1;
  }

  for (const [tierVal, expected] of Object.entries(TIER_PICK_COUNTS)) {
    const actual = tierCounts[Number(tierVal)] || 0;
    if (actual !== expected) {
      throw new ValidationError(
        `Tier ${tierVal} requires ${expected} golfer(s), but got ${actual}.`,
        "golfers"
      );
    }
  }
}

/**
 * Ensure no golfer appears on more than one of a contestant's teams (paid or pending).
 */
export async function validateNoDuplicateGolfers(
  email: string,
  newGolferIds: string[]
): Promise<void> {
  const db = getSupabase();

  // Get contestant
  const { data: contestantData } = await db
    .from(TABLE_CONTESTANTS)
    .select("id")
    .eq("email", email)
    .single();

  if (!contestantData) {
    return; // New contestant, no existing teams
  }

  const contestantId = contestantData.id;

  // Check ALL teams regardless of payment status (payments are verified manually)
  const { data: teamsData } = await db
    .from(TABLE_TEAMS)
    .select(TIER_GOLFER_COLS.join(", "))
    .eq("contestant_id", contestantId);

  const existingGolferIds = new Set<string>();
  for (const team of teamsData || []) {
    for (const col of TIER_GOLFER_COLS) {
      const golferId = team[col as keyof typeof team] as string | null;
      if (golferId) {
        existingGolferIds.add(golferId);
      }
    }
  }

  for (const gid of newGolferIds) {
    if (existingGolferIds.has(gid)) {
      // Look up golfer name for a helpful error message
      const { data: golferData } = await db
        .from(TABLE_GOLFERS)
        .select("name")
        .eq("id", gid)
        .single();

      const name = golferData?.name || gid;
      throw new ValidationError(
        `${name} is already on another of your teams.`,
        "golfers"
      );
    }
  }
}

/**
 * Ensure contestant hasn't exceeded the max team limit.
 *
 * Checks ALL teams regardless of payment status (pending or completed).
 * Since payments are verified manually via Venmo, we enforce the limit
 * at submission time to prevent users from submitting more than 3 teams.
 */
export async function validateMaxTeams(email: string): Promise<void> {
  const db = getSupabase();

  const { data: contestantData } = await db
    .from(TABLE_CONTESTANTS)
    .select("id")
    .eq("email", email)
    .single();

  if (!contestantData) {
    return; // New contestant
  }

  const contestantId = contestantData.id;

  // Check all teams against the 3-team rule (regardless of payment status)
  const { count: teamCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId);

  if (teamCount !== null && teamCount >= MAX_TEAMS_PER_EMAIL) {
    throw new ValidationError(
      `Maximum of ${MAX_TEAMS_PER_EMAIL} teams per person. You already have the maximum number of teams.`,
      "email"
    );
  }
}

/**
 * Verify all golfer IDs exist in the database. Returns golfer rows.
 */
export async function validateGolfersExist(
  golferIds: string[]
): Promise<Array<{ id: string; name: string; world_rank: number; tier: number }>> {
  const db = getSupabase();
  const { data, error } = await db
    .from(TABLE_GOLFERS)
    .select("id, name, world_rank, tier")
    .in("id", golferIds);

  if (error) {
    throw new ValidationError(`Database error: ${error.message}`, "golfers");
  }

  const foundIds = new Set((data || []).map((g) => g.id));
  const missing = golferIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    throw new ValidationError(
      `Unknown golfer ID(s): ${missing.join(", ")}`,
      "golfers"
    );
  }

  return data || [];
}

// Input format for golfer picks from the API
export interface GolferPicksRaw {
  tier1: string;
  tier2_a: string;
  tier2_b: string;
  tier3: string;
  tier4: string;
}

// Enriched golfer pick with DB data
export interface EnrichedGolferPick {
  golfer_id: string;
  tier: Tier;
  name: string;
  world_rank: number;
}

/**
 * Run all submission validations. Returns enriched golfer pick data.
 */
export async function runAllValidations(
  email: string,
  golferPicksRaw: GolferPicksRaw
): Promise<EnrichedGolferPick[]> {
  // Map the request format to tier assignments
  const tierAssignments: Array<{ golfer_id: string; tier: Tier }> = [
    { golfer_id: golferPicksRaw.tier1, tier: 1 },
    { golfer_id: golferPicksRaw.tier2_a, tier: 2 },
    { golfer_id: golferPicksRaw.tier2_b, tier: 2 },
    { golfer_id: golferPicksRaw.tier3, tier: 3 },
    { golfer_id: golferPicksRaw.tier4, tier: 4 },
  ];

  const golferIds = tierAssignments.map((p) => p.golfer_id);

  // Check deadline and submissions open
  await checkSubmissionsOpen();

  // Verify golfers exist and get their data
  const golferRows = await validateGolfersExist(golferIds);
  const golferMap = new Map(golferRows.map((g) => [g.id, g]));

  // Enrich tier assignments with DB data
  const enriched: EnrichedGolferPick[] = tierAssignments.map((assignment) => {
    const row = golferMap.get(assignment.golfer_id)!;
    return {
      golfer_id: assignment.golfer_id,
      tier: assignment.tier,
      name: row.name,
      world_rank: row.world_rank,
    };
  });

  // Validate tier composition (1-2-1-1)
  validateTierComposition(enriched);

  // Validate each golfer is in the correct tier by world rank
  validateTierPlacement(enriched);

  // Check no duplicate golfers across contestant's paid teams
  await validateNoDuplicateGolfers(email, golferIds);

  // Check max teams
  await validateMaxTeams(email);

  return enriched;
}
