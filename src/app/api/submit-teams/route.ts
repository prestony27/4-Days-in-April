/**
 * POST /api/submit-teams - Batch submit multiple teams
 *
 * Rate limited: 5/minute per IP
 * Payment is handled manually via Venmo (no Stripe integration)
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_CONTESTANTS, TABLE_TEAMS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";
import {
  checkSubmissionsOpen,
  validateGolfersExist,
  validateTierComposition,
  validateTierPlacement,
  validateNoDuplicateGolfers,
  ValidationError,
  MAX_TEAMS_PER_EMAIL,
  type GolferPicksRaw,
  type EnrichedGolferPick,
} from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateInviteCode,
  checkInviteCodeLockout,
  recordFailedAttempt,
  clearFailedAttempts,
} from "@/lib/invite-code";
import { sendConfirmationEmail } from "@/lib/email";
import type { Tier } from "@/types";

export const runtime = "nodejs";

interface TeamInput {
  team_name: string;
  golfers: GolferPicksRaw;
}

interface SubmitTeamsRequest {
  email: string;
  name: string;
  teams: TeamInput[];
  invite_code: string;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(
    `submit-teams:${ip}`,
    RATE_LIMITS.submitTeam.limit,
    RATE_LIMITS.submitTeam.windowMs
  );
  if (rateCheck.limited) {
    return rateLimitResponse();
  }

  // Check invite code lockout status
  const lockoutStatus = await checkInviteCodeLockout(ip);
  if (lockoutStatus.locked) {
    const minutes = Math.ceil(lockoutStatus.retryAfter / 60);
    return Response.json(
      { detail: `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.` },
      { status: 429 }
    );
  }

  let body: SubmitTeamsRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: { message: "Invalid JSON body", field: null } },
      { status: 400 }
    );
  }

  // Validate invite code
  if (!body.invite_code || typeof body.invite_code !== "string") {
    return Response.json(
      { detail: { message: "Invite code is required", field: "invite_code" } },
      { status: 422 }
    );
  }

  const inviteResult = validateInviteCode(body.invite_code);
  if (!inviteResult.valid) {
    await recordFailedAttempt(ip);
    return Response.json(
      { detail: { message: inviteResult.message, field: "invite_code" } },
      { status: 422 }
    );
  }

  // Clear failed attempts on successful validation
  await clearFailedAttempts(ip);

  // Basic validation
  if (!body.email || typeof body.email !== "string") {
    return Response.json(
      { detail: { message: "Email is required", field: "email" } },
      { status: 422 }
    );
  }
  if (!body.name || typeof body.name !== "string" || body.name.length < 1 || body.name.length > 100) {
    return Response.json(
      { detail: { message: "Name must be 1-100 characters", field: "name" } },
      { status: 422 }
    );
  }
  if (!Array.isArray(body.teams) || body.teams.length === 0 || body.teams.length > MAX_TEAMS_PER_EMAIL) {
    return Response.json(
      { detail: { message: `Must submit 1-${MAX_TEAMS_PER_EMAIL} teams`, field: "teams" } },
      { status: 422 }
    );
  }

  for (let i = 0; i < body.teams.length; i++) {
    const team = body.teams[i];
    if (!team.team_name || typeof team.team_name !== "string" || team.team_name.length < 1 || team.team_name.length > 100) {
      return Response.json(
        { detail: { message: `Team ${i + 1}: Team name must be 1-100 characters`, field: "teams" } },
        { status: 422 }
      );
    }
    if (!team.golfers || typeof team.golfers !== "object") {
      return Response.json(
        { detail: { message: `Team ${i + 1}: Golfers object is required`, field: "teams" } },
        { status: 422 }
      );
    }
  }

  const email = body.email.toLowerCase().trim();

  // Check submissions are open
  try {
    await checkSubmissionsOpen();
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { detail: { message: error.message, field: error.field } },
        { status: 422 }
      );
    }
    throw error;
  }

  // Validate each team and collect all golfer IDs
  const allEnrichedPicks: EnrichedGolferPick[][] = [];
  const allGolferIds: string[] = [];

  for (let i = 0; i < body.teams.length; i++) {
    const team = body.teams[i];
    const tierAssignments: Array<{ golfer_id: string; tier: Tier }> = [
      { golfer_id: team.golfers.tier1, tier: 1 },
      { golfer_id: team.golfers.tier2_a, tier: 2 },
      { golfer_id: team.golfers.tier2_b, tier: 2 },
      { golfer_id: team.golfers.tier3, tier: 3 },
      { golfer_id: team.golfers.tier4, tier: 4 },
    ];

    const golferIds = tierAssignments.map((p) => p.golfer_id);

    try {
      const golferRows = await validateGolfersExist(golferIds);
      const golferMap = new Map(golferRows.map((g) => [g.id, g]));

      const enriched: EnrichedGolferPick[] = tierAssignments.map((assignment) => {
        const row = golferMap.get(assignment.golfer_id)!;
        return {
          golfer_id: assignment.golfer_id,
          tier: assignment.tier,
          name: row.name,
          world_rank: row.world_rank,
        };
      });

      validateTierComposition(enriched);
      validateTierPlacement(enriched);

      allEnrichedPicks.push(enriched);
      allGolferIds.push(...golferIds);
    } catch (error) {
      if (error instanceof ValidationError) {
        return Response.json(
          { detail: { message: `Team ${i + 1}: ${error.message}`, field: error.field } },
          { status: 422 }
        );
      }
      throw error;
    }
  }

  // Check for duplicates within the batch itself
  const seenInBatch = new Set<string>();
  const db = getSupabase();

  for (const golferId of allGolferIds) {
    if (seenInBatch.has(golferId)) {
      const { data: golferData } = await db
        .from(TABLE_GOLFERS)
        .select("name")
        .eq("id", golferId)
        .single();
      const name = golferData?.name || golferId;
      return Response.json(
        { detail: { message: `${name} appears on multiple teams in your cart.`, field: "teams" } },
        { status: 422 }
      );
    }
    seenInBatch.add(golferId);
  }

  // Check for duplicates against existing completed teams
  try {
    await validateNoDuplicateGolfers(email, allGolferIds);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { detail: { message: error.message, field: error.field } },
        { status: 422 }
      );
    }
    throw error;
  }

  // Get or create contestant
  const { data: existingContestant } = await db
    .from(TABLE_CONTESTANTS)
    .select("id")
    .eq("email", email)
    .single();

  let contestantId: string;
  if (existingContestant) {
    contestantId = existingContestant.id;
  } else {
    const { data: insertedContestant, error: insertError } = await db
      .from(TABLE_CONTESTANTS)
      .upsert({ email, name: body.name }, { onConflict: "email" })
      .select("id")
      .single();

    if (insertError || !insertedContestant) {
      console.error("Failed to create contestant:", insertError);
      return Response.json(
        { detail: { message: "Failed to create contestant", field: null } },
        { status: 500 }
      );
    }
    contestantId = insertedContestant.id;
  }

  // Check max teams (existing + new batch, regardless of payment status)
  const { count: existingCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId);

  const totalAfterSubmit = (existingCount || 0) + body.teams.length;
  if (totalAfterSubmit > MAX_TEAMS_PER_EMAIL) {
    const remaining = MAX_TEAMS_PER_EMAIL - (existingCount || 0);
    return Response.json(
      { detail: { message: `You can only submit ${remaining} more team(s). Maximum is ${MAX_TEAMS_PER_EMAIL} teams per person.`, field: "teams" } },
      { status: 422 }
    );
  }

  // NOTE: Pending teams are NOT deleted - they persist until manual payment verification
  // This allows users to submit and pay via Venmo without losing their entry

  // Insert all teams
  const teamIds: string[] = [];
  for (let i = 0; i < body.teams.length; i++) {
    const team = body.teams[i];
    const enriched = allEnrichedPicks[i];

    const tierMap: Record<string, string> = {};
    const tier2Golfers: string[] = [];

    for (const pick of enriched) {
      if (pick.tier === 1) {
        tierMap.tier1_golfer_id = pick.golfer_id;
      } else if (pick.tier === 2) {
        tier2Golfers.push(pick.golfer_id);
      } else if (pick.tier === 3) {
        tierMap.tier3_golfer_id = pick.golfer_id;
      } else if (pick.tier === 4) {
        tierMap.tier4_golfer_id = pick.golfer_id;
      }
    }

    if (tier2Golfers.length === 2) {
      tierMap.tier2a_golfer_id = tier2Golfers[0];
      tierMap.tier2b_golfer_id = tier2Golfers[1];
    }

    const { data: insertedTeam, error: teamError } = await db
      .from(TABLE_TEAMS)
      .insert({
        contestant_id: contestantId,
        team_name: team.team_name,
        status: "active",
        payment_status: "pending",
        ...tierMap,
      })
      .select("id")
      .single();

    if (teamError || !insertedTeam) {
      // Clean up already-inserted teams
      if (teamIds.length > 0) {
        await db.from(TABLE_TEAMS).delete().in("id", teamIds);
      }
      console.error("Failed to insert team:", teamError);
      return Response.json(
        { detail: { message: "Failed to create team", field: null } },
        { status: 500 }
      );
    }

    teamIds.push(insertedTeam.id);
  }

  // Send confirmation email with all team details
  try {
    // Collect all unique golfer IDs across all teams
    const allUniqueGolferIds = new Set<string>();
    for (const enriched of allEnrichedPicks) {
      for (const pick of enriched) {
        allUniqueGolferIds.add(pick.golfer_id);
      }
    }

    // Fetch golfer details for the email
    const { data: golfersData } = await db
      .from(TABLE_GOLFERS)
      .select("id, name, tier, world_rank")
      .in("id", Array.from(allUniqueGolferIds));

    const golferMap = new Map((golfersData || []).map((g) => [g.id, g]));

    // Build team confirmations
    const teamConfirmations = body.teams.map((team, i) => {
      const enriched = allEnrichedPicks[i];
      return {
        team_name: team.team_name,
        golfers: enriched.map((pick) => {
          const g = golferMap.get(pick.golfer_id);
          return {
            name: g?.name || "Unknown",
            tier: g?.tier || 0,
            world_rank: g?.world_rank || 0,
          };
        }),
      };
    });

    await sendConfirmationEmail({
      to: email,
      contestantName: body.name,
      teams: teamConfirmations,
      totalPaid: body.teams.length * 30,
    });
  } catch (emailErr) {
    // Don't fail the submission if email fails
    console.error("Failed to send confirmation email:", emailErr);
  }

  // Return team info for redirect to Venmo payment page
  return Response.json({
    team_ids: teamIds,
    team_names: body.teams.map(t => t.team_name),
    email: email,
  });
}
