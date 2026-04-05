/**
 * Invite code validation for private contest access.
 *
 * Valid codes are stored in the INVITE_CODES environment variable as a JSON array.
 * Example: INVITE_CODES=["OGNoahBaker","AnotherCode"]
 *
 * Includes lockout mechanism after 5 failed attempts (15-minute window).
 */

import { timingSafeEqual } from "crypto";

// Lockout configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory store for failed attempts (matches rate-limit.ts pattern)
interface LockoutEntry {
  count: number;
  resetAt: number;
}

const lockoutStore = new Map<string, LockoutEntry>();

// Periodic cleanup to prevent memory leaks
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of lockoutStore.entries()) {
    if (entry.resetAt < now) {
      lockoutStore.delete(key);
    }
  }
}

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
 * @returns { locked: false } or { locked: true, retryAfter: number }
 */
export function checkInviteCodeLockout(
  ip: string
): { locked: false } | { locked: true; retryAfter: number } {
  cleanup();

  const now = Date.now();
  const key = `invite-code:${ip}`;
  const entry = lockoutStore.get(key);

  if (!entry || entry.resetAt < now) {
    return { locked: false };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { locked: true, retryAfter };
  }

  return { locked: false };
}

/**
 * Record a failed invite code attempt.
 */
export function recordFailedAttempt(ip: string): void {
  cleanup();

  const now = Date.now();
  const key = `invite-code:${ip}`;
  const entry = lockoutStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    lockoutStore.set(key, { count: 1, resetAt: now + LOCKOUT_WINDOW_MS });
  } else {
    entry.count++;
  }
}

/**
 * Clear failed attempts for an IP (call on successful validation).
 */
export function clearFailedAttempts(ip: string): void {
  const key = `invite-code:${ip}`;
  lockoutStore.delete(key);
}

/**
 * Get the number of remaining attempts before lockout.
 */
export function getRemainingAttempts(ip: string): number {
  cleanup();

  const now = Date.now();
  const key = `invite-code:${ip}`;
  const entry = lockoutStore.get(key);

  if (!entry || entry.resetAt < now) {
    return MAX_ATTEMPTS;
  }

  return Math.max(0, MAX_ATTEMPTS - entry.count);
}
