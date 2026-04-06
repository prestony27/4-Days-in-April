/**
 * Invite code validation for private contest access.
 *
 * Valid codes are stored in the INVITE_CODES environment variable as a JSON array.
 * Example: INVITE_CODES=["OGNoahBaker","AnotherCode"]
 *
 * Includes distributed lockout mechanism after 5 failed attempts (15-minute window)
 * using Upstash Redis for consistency across serverless instances.
 */

import { timingSafeEqual } from "crypto";
import { getRedis } from "./redis";

// Lockout configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SEC = 15 * 60; // 15 minutes in seconds

/**
 * Parse valid invite codes from environment variable.
 * Returns a Set of lowercase codes for case-insensitive matching.
 */
export function getValidInviteCodes(): Set<string> {
  const envValue = process.env.INVITE_CODES;
  if (!envValue) {
    return new Set();
  }

  try {
    const codes = JSON.parse(envValue) as string[];
    if (!Array.isArray(codes)) {
      console.error("INVITE_CODES must be a JSON array");
      return new Set();
    }
    // Normalize to lowercase for case-insensitive comparison
    return new Set(codes.map((code) => code.toLowerCase()));
  } catch {
    console.error("Failed to parse INVITE_CODES environment variable");
    return new Set();
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Matches pattern from auth.ts.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Validate an invite code.
 * @returns { valid: true } or { valid: false, message: string }
 */
export function validateInviteCode(
  code: string
): { valid: true } | { valid: false; message: string } {
  const validCodes = getValidInviteCodes();

  if (validCodes.size === 0) {
    // If no codes configured, this is a server error
    return { valid: false, message: "Server configuration error" };
  }

  if (!code || typeof code !== "string") {
    return { valid: false, message: "Invite code is required" };
  }

  const normalizedCode = code.toLowerCase().trim();

  // Check against each valid code using constant-time comparison
  for (const validCode of validCodes) {
    if (safeCompare(normalizedCode, validCode)) {
      return { valid: true };
    }
  }

  return { valid: false, message: "Invalid invite code" };
}

/**
 * Check if an IP is locked out from invite code attempts.
 * Uses Redis for distributed state across serverless instances.
 * @returns { locked: false } or { locked: true, retryAfter: number }
 */
export async function checkInviteCodeLockout(
  ip: string
): Promise<{ locked: false } | { locked: true; retryAfter: number }> {
  const redis = getRedis();
  const key = `invite-lockout:${ip}`;

  const [count, ttl] = await Promise.all([
    redis.get<number>(key),
    redis.ttl(key),
  ]);

  if (count === null || count < MAX_ATTEMPTS) {
    return { locked: false };
  }

  // User is locked out
  const retryAfter = ttl > 0 ? ttl : LOCKOUT_WINDOW_SEC;
  return { locked: true, retryAfter };
}

/**
 * Record a failed invite code attempt.
 * Uses Redis INCR with EXPIRE for atomic increment-with-TTL.
 */
export async function recordFailedAttempt(ip: string): Promise<void> {
  const redis = getRedis();
  const key = `invite-lockout:${ip}`;

  // Increment count atomically
  const count = await redis.incr(key);

  // Set TTL only on first attempt (when count becomes 1)
  if (count === 1) {
    await redis.expire(key, LOCKOUT_WINDOW_SEC);
  }
}

/**
 * Clear failed attempts for an IP (call on successful validation).
 */
export async function clearFailedAttempts(ip: string): Promise<void> {
  const redis = getRedis();
  const key = `invite-lockout:${ip}`;
  await redis.del(key);
}

/**
 * Get the number of remaining attempts before lockout.
 */
export async function getRemainingAttempts(ip: string): Promise<number> {
  const redis = getRedis();
  const key = `invite-lockout:${ip}`;

  const count = await redis.get<number>(key);

  if (count === null) {
    return MAX_ATTEMPTS;
  }

  return Math.max(0, MAX_ATTEMPTS - count);
}
