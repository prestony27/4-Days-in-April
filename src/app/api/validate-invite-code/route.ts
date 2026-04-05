/**
 * POST /api/validate-invite-code - Validate an invite code
 *
 * Used by the frontend to check codes before team submission.
 * Includes lockout protection after 5 failed attempts.
 */

import { NextRequest } from "next/server";
import {
  validateInviteCode,
  checkInviteCodeLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  getRemainingAttempts,
} from "@/lib/invite-code";
import { getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface ValidateInviteCodeRequest {
  code: string;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Check lockout status first
  const lockoutStatus = checkInviteCodeLockout(ip);
  if (lockoutStatus.locked) {
    const minutes = Math.ceil(lockoutStatus.retryAfter / 60);
    return Response.json(
      {
        valid: false,
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
        locked: true,
        retryAfter: lockoutStatus.retryAfter,
      },
      { status: 429 }
    );
  }

  // Parse request body
  let body: ValidateInviteCodeRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { valid: false, message: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate the code
  const result = validateInviteCode(body.code);

  if (result.valid) {
    // Clear any previous failed attempts
    clearFailedAttempts(ip);
    return Response.json({ valid: true });
  }

  // Record failed attempt
  recordFailedAttempt(ip);
  const remaining = getRemainingAttempts(ip);

  // Check if now locked out
  const newLockoutStatus = checkInviteCodeLockout(ip);
  if (newLockoutStatus.locked) {
    const minutes = Math.ceil(newLockoutStatus.retryAfter / 60);
    return Response.json(
      {
        valid: false,
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
        locked: true,
        retryAfter: newLockoutStatus.retryAfter,
      },
      { status: 429 }
    );
  }

  return Response.json(
    {
      valid: false,
      message: result.message,
      remainingAttempts: remaining,
    },
    { status: 422 }
  );
}
