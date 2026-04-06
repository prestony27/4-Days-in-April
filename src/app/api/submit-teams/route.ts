/**
 * POST /api/submit-teams - Batch submit multiple teams with single Stripe Checkout
 *
 * Rate limited: 5/minute per IP
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
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
import type { Tier } from "@/types";

export const runtime = "nodejs";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const ENTRY_FEE_CENTS = 3000; // $30.00

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}

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

  // Check max teams (existing completed + new batch)
  const { count: completedCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId)
    .eq("payment_status", "completed");

  const totalAfterSubmit = (completedCount || 0) + body.teams.length;
  if (totalAfterSubmit > MAX_TEAMS_PER_EMAIL) {
    const remaining = MAX_TEAMS_PER_EMAIL - (completedCount || 0);
    return Response.json(
      { detail: { message: `You can only submit ${remaining} more team(s). Maximum is ${MAX_TEAMS_PER_EMAIL} teams per person.`, field: "teams" } },
      { status: 422 }
    );
  }

  // Clean up any existing pending teams
  await db
    .from(TABLE_TEAMS)
    .delete()
    .eq("contestant_id", contestantId)
    .eq("payment_status", "pending");

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

  // Create Stripe Checkout Session with multiple line items
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: body.teams.map((team, index) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: `4 Days in April Contest Entry: ${team.team_name}`,
            description: `Team ${index + 1} of ${body.teams.length} for ${body.name}`,
          },
          unit_amount: ENTRY_FEE_CENTS,
        },
        quantity: 1,
      })),
      mode: "payment",
      success_url: `${FRONTEND_URL}/submit/success?team_ids=${teamIds.join(",")}`,
      cancel_url: `${FRONTEND_URL}/teams/builder?cancelled=true`,
      client_reference_id: teamIds[0],
      customer_email: email,
      metadata: {
        team_ids: teamIds.join(","),
        contestant_id: contestantId,
      },
    });
  } catch (error) {
    await db.from(TABLE_TEAMS).delete().in("id", teamIds);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe error:", message);
    return Response.json(
      { detail: `Payment service error: ${message}` },
      { status: 502 }
    );
  }

  // Store Stripe session ID on all teams
  await db
    .from(TABLE_TEAMS)
    .update({ payment_id: session.id })
    .in("id", teamIds);

  return Response.json({
    team_ids: teamIds,
    payment_url: session.url,
  });
}
