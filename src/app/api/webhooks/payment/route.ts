/**
 * POST /api/webhooks/payment - Stripe webhook (DISABLED)
 *
 * DISABLED: Payment verification is now manual via Venmo.
 * This endpoint returns early without processing any events.
 *
 * Previously handled:
 * - checkout.session.completed: Mark team as paid
 * - charge.refunded: Mark team as refunded
 *
 * To re-enable Stripe webhooks in the future:
 * 1. Restore the webhook handler from git history (commit before Venmo switch)
 * 2. Update STRIPE_WEBHOOK_SECRET in environment
 * 3. Re-configure webhook in Stripe dashboard
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // DISABLED: Payment verification is now manual via Venmo
  return Response.json({ received: true, disabled: true });
}
