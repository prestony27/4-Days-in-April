/**
 * One-off script to resend deadline transparency emails to contestants
 * who didn't receive them due to rate limiting.
 *
 * Usage: npx tsx scripts/resend-deadline-emails.ts
 *
 * Requires .env.local with:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Emails that already succeeded - DO NOT send again
const ALREADY_SENT = new Set([
  "blaise.newman.1@gmail.com",
  "willskelton4@gmail.com",
  "dnorman1212@gmail.com",
  "prestonbrowne33@gmail.com",
  "aaronjwolfe95@gmail.com",
  "chipholmes1999@gmail.com",
  "nickwalsh655@gmail.com",
  "connorlehman82@yahoo.com",
  "samott33@gmail.com",
  "sullivan.luke@ymail.com",
  "julianball1999@gmail.com",
  "michellelatin79@yahoo.com",
  "curtis.browne@verizon.net",
  "taylorlehman@rocketmail.com",
  "elisegoodhart@gmail.com",
  "clayton.horan.1@gmail.com",
  "traskbottum@gmail.com",
  "rick.cirilo@gmail.com",
  "mmiller9841@gmail.com",
  "kylebaginski@gmail.com",
  "dosh233@gmail.com",
  "evanbrowne55@gmail.com",
  "tmartinsths@yahoo.com",
].map((e) => e.toLowerCase()));

// Rate limit delay (ms) - 250ms = 4 emails/sec, safely under Resend's 5/sec
const DELAY_MS = 250;

interface GolferInfo {
  id: string;
  name: string;
  tier: number;
  world_rank: number;
}

interface AllTeamsEntry {
  team_name: string;
  contestant_name: string;
  golfers: Array<{
    name: string;
    tier: number;
    world_rank: number;
  }>;
}

const TIER_GOLFER_COLS = [
  "tier1_golfer_id",
  "tier2a_golfer_id",
  "tier2b_golfer_id",
  "tier3_golfer_id",
  "tier4_golfer_id",
];

async function main() {
  // Load env
  const { config } = await import("dotenv");
  config({ path: ".env.local" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!resendKey) {
    console.error("Missing RESEND_API_KEY");
    process.exit(1);
  }

  const db = createClient(supabaseUrl, supabaseKey);
  const resend = new Resend(resendKey);

  console.log("Fetching golfers...");
  const { data: golfersData, error: golfersError } = await db
    .from("golfers")
    .select("id, name, tier, world_rank");

  if (golfersError) {
    console.error("Failed to fetch golfers:", golfersError.message);
    process.exit(1);
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

  console.log("Fetching teams...");
  const { data: teamsData, error: teamsError } = await db
    .from("teams")
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
    console.error("Failed to fetch teams:", teamsError.message);
    process.exit(1);
  }

  if (!teamsData || teamsData.length === 0) {
    console.log("No teams found.");
    process.exit(0);
  }

  // Build all teams list and collect contestants
  const allTeams: AllTeamsEntry[] = [];
  const contestantEmails = new Map<string, { email: string; name: string }>();

  for (const team of teamsData) {
    const contestant = team.contestants as unknown as { id: string; name: string; email: string } | null;
    if (!contestant) continue;

    if (!contestantEmails.has(contestant.id)) {
      contestantEmails.set(contestant.id, {
        email: contestant.email,
        name: contestant.name,
      });
    }

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

  // Filter to only contestants who didn't receive the email
  const toSend: Array<{ email: string; name: string }> = [];
  for (const [, contestant] of contestantEmails) {
    if (!ALREADY_SENT.has(contestant.email.toLowerCase())) {
      toSend.push(contestant);
    }
  }

  console.log(`\nTotal contestants: ${contestantEmails.size}`);
  console.log(`Already sent: ${ALREADY_SENT.size}`);
  console.log(`To send: ${toSend.length}`);
  console.log("\nRecipients:");
  toSend.forEach((c) => console.log(`  - ${c.email} (${c.name})`));

  if (toSend.length === 0) {
    console.log("\nNo emails to send!");
    process.exit(0);
  }

  console.log("\nSending emails...\n");

  let sent = 0;
  let failed = 0;

  for (const contestant of toSend) {
    const result = await sendDeadlineEmail(resend, {
      to: contestant.email,
      contestantName: contestant.name,
      allTeams,
    });

    if (result.success) {
      sent++;
      console.log(`✓ Sent to ${contestant.email}`);
    } else {
      failed++;
      console.error(`✗ Failed ${contestant.email}: ${result.error}`);
    }

    // Rate limit delay
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
}

async function sendDeadlineEmail(
  resend: Resend,
  params: { to: string; contestantName: string; allTeams: AllTeamsEntry[] }
): Promise<{ success: boolean; error?: string }> {
  const { to, contestantName, allTeams } = params;
  const totalTeams = allTeams.length;
  const subject = `Submissions Closed - All ${totalTeams} Team Picks Revealed`;

  const teamsHtml = allTeams.map((team) => {
    const golferRows = team.golfers
      .sort((a, b) => a.tier - b.tier)
      .map((g) => `
        <tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">T${g.tier}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${g.name}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 13px;">#${g.world_rank}</td>
        </tr>
      `).join("");

    return `
      <div style="margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: #065f46; color: white; padding: 10px 12px;">
          <strong style="font-size: 15px;">${team.team_name}</strong>
          <span style="opacity: 0.8; font-size: 13px;"> — ${team.contestant_name}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            ${golferRows}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #065f46; margin: 0; font-size: 28px;">Four Days in April</h1>
          <p style="color: #6b7280; margin: 8px 0 0 0;">2026 Contest</p>
        </div>

        <div style="background: #ecfdf5; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; color: #065f46; font-size: 18px; font-weight: 600;">
            Submissions Are Now Closed
          </p>
        </div>

        <p>Hi ${contestantName},</p>

        <p>
          The submission deadline has passed. Below is the <strong>complete list of all ${totalTeams} team submissions</strong>
          for the Four Days in April 2026 Contest.
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          This email is being sent to all contestants for full transparency. No changes can be made to any team after this point.
        </p>

        <div style="margin: 24px 0;">
          <h2 style="color: #065f46; font-size: 18px; margin-bottom: 16px; border-bottom: 2px solid #065f46; padding-bottom: 8px;">
            All Team Submissions (${totalTeams} teams)
          </h2>
          ${teamsHtml}
        </div>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; font-weight: 500;">Track the Tournament</p>
          <p style="margin: 8px 0 0 0; color: #6b7280;">
            Follow along on the live leaderboard as scores update throughout the tournament.
          </p>
          <p style="margin: 12px 0 0 0;">
            <a href="https://4-days-in-april.vercel.app/leaderboard"
               style="display: inline-block; background: #065f46; color: white; padding: 10px 20px;
                      border-radius: 6px; text-decoration: none; font-weight: 500;">
              View Leaderboard
            </a>
          </p>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          The tournament runs April 9-12, 2026. Good luck!
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          Four Days in April 2026 Contest<br>
          Questions? Reply to this email.
        </p>
      </body>
    </html>
  `;

  const text = `
Four Days in April 2026 Contest
Submissions Are Now Closed

Hi ${contestantName},

The submission deadline has passed. Below is the complete list of all ${totalTeams} team submissions for the Four Days in April 2026 Contest.

This email is being sent to all contestants for full transparency. No changes can be made to any team after this point.

ALL TEAM SUBMISSIONS (${totalTeams} teams)
${"=".repeat(40)}

${allTeams.map((team) => `
${team.team_name} — ${team.contestant_name}
${team.golfers
  .sort((a, b) => a.tier - b.tier)
  .map((g) => `  T${g.tier}: ${g.name} (#${g.world_rank})`)
  .join("\n")}
`).join("\n")}

Track the tournament: https://4-days-in-april.vercel.app/leaderboard

The tournament runs April 9-12, 2026. Good luck!
  `.trim();

  try {
    const { error } = await resend.emails.send({
      from: "Four Days in April <4daysinapril@ppyconsultinggroup.com>",
      to,
      subject,
      html,
      text,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
