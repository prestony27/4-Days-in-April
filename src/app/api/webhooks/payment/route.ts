/**
 * POST /api/webhooks/payment - Stripe webhook to confirm payment
 *
 * Handles:
 * - checkout.session.completed: Mark team as paid
 * - charge.refunded: Mark team as refunded
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabase } from "@/lib/db";
import { TABLE_TEAMS, TABLE_CONTESTANTS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";
import { sendConfirmationEmail } from "@/lib/email";

// Force Node.js runtime for Stripe signature verification
export const runtime = "nodejs";

// Disable body parsing to get raw body for signature verification
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return Response.json(
      { detail: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Get the raw body as text for signature verification
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { detail: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return Response.json(
      { detail: "Invalid signature" },
      { status: 400 }
    );
  }

  const db = getSupabase();

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.payment_intent as string || session.id;

    // Support batch payments (team_ids is comma-separated) or single team
    const teamIdsStr = session.metadata?.team_ids;
    const teamIds = teamIdsStr
      ? teamIdsStr.split(",")
      : [session.client_reference_id || session.metadata?.team_id].filter(Boolean) as string[];

    for (const teamId of teamIds) {
      // Idempotency: only update if not already completed (Stripe retries for 72h)
      const { data: teamData } = await db
        .from(TABLE_TEAMS)
        .select("payment_status, contestant_id")
        .eq("id", teamId)
        .single();

      if (teamData && teamData.payment_status !== "completed") {
        const { error: updateError } = await db
          .from(TABLE_TEAMS)
          .update({
            payment_status: "completed",
            payment_id: paymentId,
            status: "active",
          })
          .eq("id", teamId);

        // Handle database trigger violations (race condition caught)
        if (updateError) {
          const isConstraintViolation =
            updateError.code === "23514" ||
            updateError.message?.includes("Maximum of 3 completed teams") ||
            updateError.message?.includes("already on another completed team");

          if (isConstraintViolation) {
            console.error(`Race condition caught for team ${teamId}: ${updateError.message}`);

            // Issue refund for this team ($30 partial refund, not entire batch)
            try {
              await getStripe().refunds.create({
                payment_intent: paymentId,
                amount: 3000, // $30 in cents - partial refund for single team
                reason: "duplicate",
              });
              console.log(`Refund issued for team ${teamId} due to race condition`);
            } catch (refundError) {
              console.error(`Failed to issue refund for team ${teamId}:`, refundError);
            }

            // Mark team as refunded
            await db.from(TABLE_TEAMS).update({ payment_status: "refunded" }).eq("id", teamId);

            // Send apology email
            try {
              const { data: contestant } = await db
                .from(TABLE_CONTESTANTS)
                .select("email, name")
                .eq("id", teamData.contestant_id)
                .single();

              if (contestant) {
                const { sendRefundEmail } = await import("@/lib/email");
                await sendRefundEmail({
                  to: contestant.email,
                  contestantName: contestant.name,
                  reason: "Your payment was processed but your entry could not be completed due to a conflict (duplicate golfer or maximum teams exceeded). Your $30 has been automatically refunded.",
                });
              }
            } catch (emailErr) {
              console.error("Failed to send refund email:", emailErr);
            }

            continue; // Skip to next team
          }

          // Other database errors - log and continue
          console.error(`Failed to update team ${teamId}:`, updateError);
          continue;
        }

        console.log(`Team ${teamId} marked as completed`);
      }
    }

    if (teamIds.length > 1) {
      console.log(`Batch payment completed: ${teamIds.length} teams`);
    }

    // Send confirmation email
    try {
      // Fetch team details with golfer info
      const { data: teamsData } = await db
        .from(TABLE_TEAMS)
        .select(`
          id,
          team_name,
          contestant_id,
          tier1_golfer_id,
          tier2a_golfer_id,
          tier2b_golfer_id,
          tier3_golfer_id,
          tier4_golfer_id
        `)
        .in("id", teamIds);

      if (teamsData && teamsData.length > 0) {
        // Get contestant info
        const contestantId = teamsData[0].contestant_id;
        const { data: contestant } = await db
          .from(TABLE_CONTESTANTS)
          .select("email, name")
          .eq("id", contestantId)
          .single();

        if (contestant) {
          // Collect all golfer IDs
          const allGolferIds = new Set<string>();
          for (const team of teamsData) {
            for (const col of TIER_GOLFER_COLS) {
              const gid = team[col as keyof typeof team] as string | null;
              if (gid) allGolferIds.add(gid);
            }
          }

          // Fetch golfer details
          const { data: golfersData } = await db
            .from(TABLE_GOLFERS)
            .select("id, name, tier, world_rank")
            .in("id", Array.from(allGolferIds));

          const golferMap = new Map(
            (golfersData || []).map((g) => [g.id, g])
          );

          // Build team confirmations
          const teamConfirmations = teamsData.map((team) => {
            const golferIds = [
              team.tier1_golfer_id,
              team.tier2a_golfer_id,
              team.tier2b_golfer_id,
              team.tier3_golfer_id,
              team.tier4_golfer_id,
            ].filter(Boolean) as string[];

            return {
              team_name: team.team_name,
              golfers: golferIds.map((gid) => {
                const g = golferMap.get(gid);
                return {
                  name: g?.name || "Unknown",
                  tier: g?.tier || 0,
                  world_rank: g?.world_rank || 0,
                };
              }),
            };
          });

          await sendConfirmationEmail({
            to: contestant.email,
            contestantName: contestant.name,
            teams: teamConfirmations,
            totalPaid: teamIds.length * 30,
          });
        }
      }
    } catch (emailErr) {
      // Don't fail the webhook if email fails
      console.error("Failed to send confirmation email:", emailErr);
    }
  }

  // Handle refund events
  else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntent = charge.payment_intent;

    if (paymentIntent) {
      await db
        .from(TABLE_TEAMS)
        .update({
          payment_status: "refunded",
        })
        .eq("payment_id", paymentIntent);

      console.log(`Team with payment_id ${paymentIntent} marked as refunded`);
    }
  }

  return Response.json({ received: true });
}
