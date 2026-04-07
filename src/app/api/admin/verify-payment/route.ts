/**
 * POST /api/admin/verify-payment - Mark teams as paid after Venmo verification
 *
 * Requires: Authorization: Bearer {ADMIN_API_KEY}
 *
 * Body options:
 *   { "email": "user@example.com" }           - Mark all pending teams for this email as completed
 *   { "team_id": "uuid" }                     - Mark a specific team as completed
 *   { "team_ids": ["uuid1", "uuid2"] }        - Mark multiple specific teams as completed
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { TABLE_TEAMS, TABLE_CONTESTANTS } from "@/lib/schema";

export const runtime = "nodejs";

interface VerifyPaymentRequest {
  email?: string;
  team_id?: string;
  team_ids?: string[];
}

export async function POST(request: NextRequest) {
  // Verify admin authentication
  const authHeader = request.headers.get("authorization");
  const authResult = verifyAdminAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { error: authResult.message },
      { status: authResult.status }
    );
  }

  let body: VerifyPaymentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { email, team_id, team_ids } = body;

  // Must provide at least one identifier
  if (!email && !team_id && !team_ids) {
    return Response.json(
      { error: "Must provide email, team_id, or team_ids" },
      { status: 400 }
    );
  }

  const db = getSupabase();
  let updatedTeams: Array<{ id: string; team_name: string }> = [];

  try {
    if (email) {
      // Get contestant by email
      const { data: contestant } = await db
        .from(TABLE_CONTESTANTS)
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (!contestant) {
        return Response.json(
          { error: `No contestant found with email: ${email}` },
          { status: 404 }
        );
      }

      // Update all pending teams for this contestant
      const { data, error } = await db
        .from(TABLE_TEAMS)
        .update({ payment_status: "completed" })
        .eq("contestant_id", contestant.id)
        .eq("payment_status", "pending")
        .select("id, team_name");

      if (error) {
        throw error;
      }

      updatedTeams = data || [];
    } else if (team_id) {
      // Update a single team
      const { data, error } = await db
        .from(TABLE_TEAMS)
        .update({ payment_status: "completed" })
        .eq("id", team_id)
        .eq("payment_status", "pending")
        .select("id, team_name");

      if (error) {
        throw error;
      }

      updatedTeams = data || [];
    } else if (team_ids && team_ids.length > 0) {
      // Update multiple specific teams
      const { data, error } = await db
        .from(TABLE_TEAMS)
        .update({ payment_status: "completed" })
        .in("id", team_ids)
        .eq("payment_status", "pending")
        .select("id, team_name");

      if (error) {
        throw error;
      }

      updatedTeams = data || [];
    }

    if (updatedTeams.length === 0) {
      return Response.json({
        message: "No pending teams found to update",
        updated_count: 0,
        teams: [],
      });
    }

    return Response.json({
      message: `Successfully marked ${updatedTeams.length} team(s) as paid`,
      updated_count: updatedTeams.length,
      teams: updatedTeams,
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    return Response.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }
}
