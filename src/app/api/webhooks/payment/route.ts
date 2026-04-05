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
import { TABLE_TEAMS } from "@/lib/schema";

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
    const teamId = session.client_reference_id || session.metadata?.team_id;

    if (teamId) {
      // Idempotency: only update if not already completed (Stripe retries for 72h)
      const { data: teamData } = await db
        .from(TABLE_TEAMS)
        .select("payment_status")
        .eq("id", teamId)
        .single();

      if (teamData && teamData.payment_status !== "completed") {
        await db
          .from(TABLE_TEAMS)
          .update({
            payment_status: "completed",
            payment_id: session.payment_intent as string || session.id,
            status: "active",
          })
          .eq("id", teamId);

        console.log(`Team ${teamId} marked as completed`);
      }
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
