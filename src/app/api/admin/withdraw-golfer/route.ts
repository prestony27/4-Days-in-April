/**
 * POST /api/admin/withdraw-golfer - Mark golfer as withdrawn pre-tournament
 *
 * This handles golfers who withdraw BEFORE the tournament starts.
 * Affected teams are automatically refunded and invalidated.
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import {
  TABLE_GOLFERS,
  TABLE_TEAMS,
  TABLE_CONTESTANTS,
  TIER_GOLFER_COLS,
} from "@/lib/schema";
import { sendWithdrawalEmail } from "@/lib/email";

export const runtime = "nodejs";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}

interface RequestBody {
  golfer_id: string;
}

interface AffectedTeam {
  team_id: string;
  team_name: string;
  contestant_email: string;
  contestant_name: string;
  refund_status: "success" | "failed" | "skipped";
  email_status: "sent" | "failed" | "skipped";
  error?: string;
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

  if (!body.golfer_id || typeof body.golfer_id !== "string") {
    return Response.json(
      { detail: "golfer_id is required" },
      { status: 422 }
    );
  }

  const db = getSupabase();

  // Fetch the golfer to confirm they exist and get their details
  const { data: golfer, error: golferError } = await db
    .from(TABLE_GOLFERS)
    .select("id, name, tier, status")
    .eq("id", body.golfer_id)
    .single();

  if (golferError || !golfer) {
    return Response.json(
      { detail: `Golfer not found: ${body.golfer_id}` },
      { status: 404 }
    );
  }

  if (golfer.status === "STATUS_WITHDRAWN") {
    return Response.json(
      { detail: `Golfer ${golfer.name} is already marked as withdrawn` },
      { status: 409 }
    );
  }

  // Mark golfer as withdrawn
  const { error: updateError } = await db
    .from(TABLE_GOLFERS)
    .update({ status: "STATUS_WITHDRAWN" })
    .eq("id", body.golfer_id);

  if (updateError) {
    console.error("Failed to update golfer status:", updateError);
    return Response.json(
      { detail: "Failed to update golfer status" },
      { status: 500 }
    );
  }

  // Find all completed teams that have this golfer
  // We need to check all tier columns
  const affectedTeamsResults: AffectedTeam[] = [];

  for (const tierCol of TIER_GOLFER_COLS) {
    const { data: teams } = await db
      .from(TABLE_TEAMS)
      .select(`
        id,
        team_name,
        payment_id,
        payment_status,
        contestant_id,
        contestants (email, name)
      `)
      .eq(tierCol, body.golfer_id)
      .eq("payment_status", "completed");

    if (!teams || teams.length === 0) continue;

    for (const team of teams) {
      // Supabase returns single relation as object, but TS thinks it's array
      const contestantData = team.contestants as unknown as { email: string; name: string } | null;

      if (!contestantData) {
        console.error(`Team ${team.id} has no contestant`);
        continue;
      }

      const contestant = contestantData;

      const result: AffectedTeam = {
        team_id: team.id,
        team_name: team.team_name,
        contestant_email: contestant.email,
        contestant_name: contestant.name,
        refund_status: "skipped",
        email_status: "skipped",
      };

      // Process refund via Stripe
      if (team.payment_id) {
        try {
          await getStripe().refunds.create({
            payment_intent: team.payment_id,
            amount: 3000, // $30 in cents
            reason: "requested_by_customer",
          });
          result.refund_status = "success";

          // Update team payment status to refunded
          await db
            .from(TABLE_TEAMS)
            .update({ payment_status: "refunded" })
            .eq("id", team.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(`Refund failed for team ${team.id}:`, message);
          result.refund_status = "failed";
          result.error = message;
        }
      } else {
        result.error = "No payment_id on team";
      }

      // Send notification email
      if (result.refund_status === "success") {
        const emailResult = await sendWithdrawalEmail({
          to: contestant.email,
          contestantName: contestant.name,
          teamName: team.team_name,
          withdrawnGolfer: {
            name: golfer.name,
            tier: golfer.tier,
          },
        });

        result.email_status = emailResult.success ? "sent" : "failed";
        if (!emailResult.success) {
          result.error = emailResult.error;
        }
      }

      affectedTeamsResults.push(result);
    }
  }

  const successCount = affectedTeamsResults.filter(
    (r) => r.refund_status === "success"
  ).length;
  const failedCount = affectedTeamsResults.filter(
    (r) => r.refund_status === "failed"
  ).length;

  return Response.json({
    golfer: {
      id: golfer.id,
      name: golfer.name,
      tier: golfer.tier,
    },
    affected_teams: affectedTeamsResults.length,
    refunds_processed: successCount,
    refunds_failed: failedCount,
    details: affectedTeamsResults,
  });
}
