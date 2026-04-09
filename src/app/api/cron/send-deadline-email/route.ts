/**
 * POST /api/cron/send-deadline-email
 *
 * Triggered at the submission deadline (7:30 AM EDT, April 9, 2026).
 * Sends a transparency email to all contestants showing every team's picks.
 *
 * This ensures no one can claim cheating since everyone receives the same
 * snapshot of all submissions at the exact moment the deadline passes.
 */

import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { TABLE_TEAMS, TABLE_CONTESTANTS, TABLE_GOLFERS, TIER_GOLFER_COLS } from "@/lib/schema";
import { sendDeadlineEmail } from "@/lib/email";
import { verifyCronAuth } from "@/lib/auth";

interface GolferInfo {
  id: string;
  name: string;
  tier: number;
  world_rank: number;
}

interface TeamWithGolfers {
  team_name: string;
  contestant_name: string;
  golfers: Array<{
    name: string;
    tier: number;
    world_rank: number;
  }>;
}

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const authResult = verifyCronAuth(authHeader);

  if (!authResult.valid) {
    return Response.json(
      { detail: authResult.message },
      { status: authResult.status }
    );
  }

  const db = getSupabase();

  try {
    // 1. Fetch all golfers for lookup
    const { data: golfersData, error: golfersError } = await db
      .from(TABLE_GOLFERS)
      .select("id, name, tier, world_rank");

    if (golfersError) {
      throw new Error(`Failed to fetch golfers: ${golfersError.message}`);
    }

    const golferMap = new Map<string, GolferInfo>();
    for (const g of golfersData || []) {
      golferMap.set(g.id, {
        id: g.id,
        name: g.name,
        tier: g.tier,
        world_rank: g.world_rank,
      });
    }

    // 2. Fetch all teams with contestant info
    const { data: teamsData, error: teamsError } = await db
      .from(TABLE_TEAMS)
      .select(`
        id,
        team_name,
        tier1_golfer_id,
        tier2a_golfer_id,
        tier2b_golfer_id,
        tier3_golfer_id,
        tier4_golfer_id,
        contestants(id, name, email)
      `)
      .order("submitted_at", { ascending: true });

    if (teamsError) {
      throw new Error(`Failed to fetch teams: ${teamsError.message}`);
    }

    if (!teamsData || teamsData.length === 0) {
      return Response.json({
        success: true,
        message: "No teams to send emails for",
        emailsSent: 0,
      });
    }

    // 3. Build the all-teams list with golfer details
    const allTeams: TeamWithGolfers[] = [];
    const contestantEmails = new Map<string, { email: string; name: string }>();

    for (const team of teamsData) {
      const contestant = team.contestants as unknown as { id: string; name: string; email: string } | null;
      if (!contestant) continue;

      // Track unique contestants
      if (!contestantEmails.has(contestant.id)) {
        contestantEmails.set(contestant.id, {
          email: contestant.email,
          name: contestant.name,
        });
      }

      // Build golfer list for this team
      const golfers: Array<{ name: string; tier: number; world_rank: number }> = [];
      for (const col of TIER_GOLFER_COLS) {
        const golferId = team[col as keyof typeof team] as string | null;
        if (golferId) {
          const golfer = golferMap.get(golferId);
          if (golfer) {
            golfers.push({
              name: golfer.name,
              tier: golfer.tier,
              world_rank: golfer.world_rank,
            });
          }
        }
      }

      allTeams.push({
        team_name: team.team_name,
        contestant_name: contestant.name,
        golfers,
      });
    }

    // 4. Send email to each contestant (with rate limiting for Resend's 5/sec limit)
    let emailsSent = 0;
    let emailsFailed = 0;
    const errors: string[] = [];

    for (const [, contestant] of contestantEmails) {
      const result = await sendDeadlineEmail({
        to: contestant.email,
        contestantName: contestant.name,
        allTeams,
      });

      if (result.success) {
        emailsSent++;
      } else {
        emailsFailed++;
        errors.push(`${contestant.email}: ${result.error}`);
      }

      // Rate limit: 250ms delay = 4 emails/sec (under Resend's 5/sec limit)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`Deadline emails: ${emailsSent} sent, ${emailsFailed} failed`);

    return Response.json({
      success: true,
      message: `Deadline transparency emails sent`,
      totalTeams: allTeams.length,
      totalContestants: contestantEmails.size,
      emailsSent,
      emailsFailed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Deadline email cron error:", error);
    return Response.json(
      { detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing via browser
export async function GET(request: NextRequest) {
  return POST(request);
}
