/**
 * Email service using Resend for transactional emails.
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

interface TeamConfirmation {
  team_name: string;
  golfers: Array<{
    name: string;
    tier: number;
    world_rank: number;
  }>;
}

interface SendConfirmationEmailParams {
  to: string;
  contestantName: string;
  teams: TeamConfirmation[];
  totalPaid: number;
}

export async function sendConfirmationEmail({
  to,
  contestantName,
  teams,
  totalPaid,
}: SendConfirmationEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping confirmation email");
    return { success: false, error: "Email service not configured" };
  }

  const teamCount = teams.length;
  const subject = teamCount > 1
    ? `Confirmed: Your ${teamCount} Masters Pool Teams`
    : `Confirmed: Your Masters Pool Team`;

  const teamsHtml = teams.map((team) => {
    const golferRows = team.golfers
      .sort((a, b) => a.tier - b.tier)
      .map((g) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Tier ${g.tier}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${g.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">#${g.world_rank}</td>
        </tr>
      `).join("");

    return `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; color: #065f46; font-size: 18px;">${team.team_name}</h3>
        <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #065f46; color: white;">
              <th style="padding: 10px 12px; text-align: left; font-weight: 500;">Tier</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 500;">Golfer</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 500;">Rank</th>
            </tr>
          </thead>
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
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #065f46; margin: 0; font-size: 28px;">Four Days in April</h1>
          <p style="color: #6b7280; margin: 8px 0 0 0;">2026 Masters Pool</p>
        </div>

        <div style="background: #ecfdf5; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; color: #065f46; font-size: 18px; font-weight: 600;">
            Payment Confirmed!
          </p>
        </div>

        <p>Hi ${contestantName},</p>

        <p>
          Your ${teamCount > 1 ? `${teamCount} teams have` : "team has"} been submitted for the 2026 Masters Pool.
          Here's your confirmation:
        </p>

        ${teamsHtml}

        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; font-weight: 500;">Payment Summary</p>
          <p style="margin: 8px 0 0 0; color: #6b7280;">
            ${teamCount} team${teamCount > 1 ? "s" : ""} × $30 = <strong>$${totalPaid}</strong>
          </p>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          The tournament runs April 9-12, 2026. Track your team on the
          <a href="https://4-days-in-april.vercel.app/leaderboard" style="color: #065f46;">live leaderboard</a>.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          Four Days in April - 2026 Masters Pool<br>
          Questions? Reply to this email.
        </p>
      </body>
    </html>
  `;

  const text = `
Four Days in April - 2026 Masters Pool
Payment Confirmed!

Hi ${contestantName},

Your ${teamCount > 1 ? `${teamCount} teams have` : "team has"} been submitted for the 2026 Masters Pool.

${teams.map((team) => `
${team.team_name}
${team.golfers
  .sort((a, b) => a.tier - b.tier)
  .map((g) => `  Tier ${g.tier}: ${g.name} (#${g.world_rank})`)
  .join("\n")}
`).join("\n")}

Payment Summary: ${teamCount} team${teamCount > 1 ? "s" : ""} × $30 = $${totalPaid}

Track your team: https://4-days-in-april.vercel.app/leaderboard

The tournament runs April 9-12, 2026. Good luck!
  `.trim();

  try {
    const { error } = await getResend().emails.send({
      from: "Four Days in April <noreply@ppyconsultinggroup.com>",
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("Failed to send confirmation email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Confirmation email sent to ${to}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send error:", message);
    return { success: false, error: message };
  }
}
