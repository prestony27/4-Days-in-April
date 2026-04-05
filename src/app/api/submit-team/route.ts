/**
 * POST /api/submit-team - Validate picks and create Stripe Checkout Session
 *
 * Rate limited: 5/minute per IP
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabase } from "@/lib/db";
import { TABLE_CONTESTANTS, TABLE_TEAMS, TIER_GOLFER_COLS } from "@/lib/schema";
import {
  runAllValidations,
  ValidationError,
  MAX_TEAMS_PER_EMAIL,
  type GolferPicksRaw,
} from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

// Force Node.js runtime for Stripe
export const runtime = "nodejs";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const ENTRY_FEE_CENTS = 3000; // $30.00

// Lazy initialization to avoid build-time errors
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}

interface SubmitTeamRequest {
  email: string;
  name: string;
  team_name: string;
  golfers: GolferPicksRaw;
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5/minute
  const ip = getClientIp(request);
  const rateCheck = checkRateLimit(
    `submit-team:${ip}`,
    RATE_LIMITS.submitTeam.limit,
    RATE_LIMITS.submitTeam.windowMs
  );
  if (rateCheck.limited) {
    return rateLimitResponse();
  }

  // Parse request body
  let body: SubmitTeamRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: { message: "Invalid JSON body", field: null } },
      { status: 400 }
    );
  }

  // Basic field validation
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
  if (!body.team_name || typeof body.team_name !== "string" || body.team_name.length < 1 || body.team_name.length > 100) {
    return Response.json(
      { detail: { message: "Team name must be 1-100 characters", field: "team_name" } },
      { status: 422 }
    );
  }
  if (!body.golfers || typeof body.golfers !== "object") {
    return Response.json(
      { detail: { message: "Golfers object is required", field: "golfers" } },
      { status: 422 }
    );
  }

  // Normalize email to prevent duplicate contestants
  const email = body.email.toLowerCase().trim();

  // Run all validations (deadline, tiers, duplicates, max teams)
  let enrichedPicks;
  try {
    enrichedPicks = await runAllValidations(email, body.golfers);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { detail: { message: error.message, field: error.field } },
        { status: 422 }
      );
    }
    console.error("Validation error:", error);
    return Response.json(
      { detail: { message: "Validation failed", field: null } },
      { status: 500 }
    );
  }

  const db = getSupabase();

  // Get or create contestant (use upsert to avoid race on concurrent first-time submissions)
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

  // Build tier-specific golfer columns
  const tierMap: Record<string, string> = {};
  const tier2Golfers: string[] = [];

  for (const pick of enrichedPicks) {
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

  // Insert team (pending payment)
  const teamData = {
    contestant_id: contestantId,
    team_name: body.team_name,
    status: "active",
    payment_status: "pending",
    ...tierMap,
  };

  const { data: insertedTeam, error: teamError } = await db
    .from(TABLE_TEAMS)
    .insert(teamData)
    .select("id")
    .single();

  if (teamError || !insertedTeam) {
    console.error("Failed to insert team:", teamError);
    return Response.json(
      { detail: { message: "Failed to create team", field: null } },
      { status: 500 }
    );
  }

  const teamId = insertedTeam.id;

  // Post-insert race condition checks (catches concurrent submissions)
  // 1. Max 3 completed teams
  const { count: completedCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId)
    .eq("payment_status", "completed");

  if (completedCount !== null && completedCount > MAX_TEAMS_PER_EMAIL) {
    await db.from(TABLE_TEAMS).delete().eq("id", teamId);
    return Response.json(
      { detail: { message: `Maximum of ${MAX_TEAMS_PER_EMAIL} teams per person.`, field: "email" } },
      { status: 409 }
    );
  }

  // 2. Max 1 pending team (prevent orphan-team attack)
  const { count: pendingCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId)
    .eq("payment_status", "pending");

  if (pendingCount !== null && pendingCount > 1) {
    await db.from(TABLE_TEAMS).delete().eq("id", teamId);
    return Response.json(
      { detail: { message: "Complete or cancel your pending payment before submitting another team.", field: "email" } },
      { status: 409 }
    );
  }

  // 3. Post-insert race condition check: verify no duplicate golfers snuck in
  const newGolferIds = new Set(Object.values(tierMap));
  const { data: otherTeams } = await db
    .from(TABLE_TEAMS)
    .select(TIER_GOLFER_COLS.join(", "))
    .eq("contestant_id", contestantId)
    .in("payment_status", ["completed", "pending"])
    .neq("id", teamId);

  const existingGolferIds = new Set<string>();
  for (const t of otherTeams || []) {
    for (const col of TIER_GOLFER_COLS) {
      const gid = t[col as keyof typeof t] as string | null;
      if (gid) existingGolferIds.add(gid);
    }
  }

  const overlap = [...newGolferIds].filter((id) => existingGolferIds.has(id));
  if (overlap.length > 0) {
    await db.from(TABLE_TEAMS).delete().eq("id", teamId);
    return Response.json(
      { detail: { message: "A golfer on this team is already on another of your teams.", field: "golfers" } },
      { status: 409 }
    );
  }

  // Create Stripe Checkout Session
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Masters Pool Entry: ${body.team_name}`,
              description: `Team entry for ${body.name}`,
            },
            unit_amount: ENTRY_FEE_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${FRONTEND_URL}/submit/success?team_id=${teamId}`,
      cancel_url: `${FRONTEND_URL}/teams/builder?cancelled=true`,
      client_reference_id: teamId,
      customer_email: email,
      metadata: {
        team_id: teamId,
        contestant_id: contestantId,
      },
    });
  } catch (error) {
    // Clean up the team if Stripe fails
    await db.from(TABLE_TEAMS).delete().eq("id", teamId);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe error:", message);
    return Response.json(
      { detail: `Payment service error: ${message}` },
      { status: 502 }
    );
  }

  // Store Stripe session ID on the team
  await db
    .from(TABLE_TEAMS)
    .update({ payment_id: session.id })
    .eq("id", teamId);

  return Response.json({
    team_id: teamId,
    payment_url: session.url,
  });
}
