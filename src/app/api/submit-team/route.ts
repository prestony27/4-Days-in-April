/**
 * POST /api/submit-team - Validate picks and create team entry
 *
 * Rate limited: 5/minute per IP
 * Payment is handled manually via Venmo (no Stripe integration)
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_CONTESTANTS, TABLE_TEAMS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";
import {
  runAllValidations,
  ValidationError,
  MAX_TEAMS_PER_EMAIL,
  type GolferPicksRaw,
} from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateInviteCode,
  checkInviteCodeLockout,
  recordFailedAttempt,
  clearFailedAttempts,
} from "@/lib/invite-code";
import { sendConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

interface SubmitTeamRequest {
  email: string;
  name: string;
  team_name: string;
  golfers: GolferPicksRaw;
  invite_code: string;
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5/minute
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(
    `submit-team:${ip}`,
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

  // NOTE: Pending teams are NOT deleted - they persist until manual payment verification
  // This allows users to submit and pay via Venmo without losing their entry

  // Insert team (pending payment - will be marked completed after manual Venmo verification)
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
  // 1. Max 3 teams (regardless of payment status)
  const { count: teamCount } = await db
    .from(TABLE_TEAMS)
    .select("id", { count: "exact", head: true })
    .eq("contestant_id", contestantId);

  if (teamCount !== null && teamCount > MAX_TEAMS_PER_EMAIL) {
    await db.from(TABLE_TEAMS).delete().eq("id", teamId);
    return Response.json(
      { detail: { message: `Maximum of ${MAX_TEAMS_PER_EMAIL} teams per person.`, field: "email" } },
      { status: 409 }
    );
  }

  // 2. Post-insert race condition check: verify no duplicate golfers snuck in
  const newGolferIds = new Set(Object.values(tierMap));
  const { data: otherTeams } = await db
    .from(TABLE_TEAMS)
    .select(TIER_GOLFER_COLS.join(", "))
    .eq("contestant_id", contestantId)
    .eq("payment_status", "completed");

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

  // Send confirmation email with team details
  try {
    // Fetch golfer details for the email
    const golferIds = Object.values(tierMap);
    const { data: golfersData } = await db
      .from(TABLE_GOLFERS)
      .select("id, name, tier, world_rank")
      .in("id", golferIds);

    const golferMap = new Map((golfersData || []).map((g) => [g.id, g]));

    const teamConfirmation = {
      team_name: body.team_name,
      golfers: golferIds.map((gid) => {
        const g = golferMap.get(gid);
        return {
          name: g?.name || "Unknown",
          tier: g?.tier || 0,
          world_rank: g?.world_rank || 0,
        };
      }),
    };

    await sendConfirmationEmail({
      to: email,
      contestantName: body.name,
      teams: [teamConfirmation],
      totalPaid: 30,
    });
  } catch (emailErr) {
    // Don't fail the submission if email fails
    console.error("Failed to send confirmation email:", emailErr);
  }

  // Return team info for redirect to Venmo payment page
  return Response.json({
    team_id: teamId,
    team_name: body.team_name,
    email: email,
  });
}
