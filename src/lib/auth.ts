/**
 * Authentication helpers for admin and cron routes.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { timingSafeEqual } from "crypto";

/**
 * Verify admin authorization from the Authorization header.
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns { valid: true } or { valid: false, status: number, message: string }
 */
export function verifyAdminAuth(
  authHeader: string | null
): { valid: true } | { valid: false; status: number; message: string } {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return { valid: false, status: 500, message: "ADMIN_API_KEY not configured" };
  }

  if (!authHeader) {
    return { valid: false, status: 401, message: "Missing Authorization header" };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return { valid: false, status: 401, message: "Invalid Authorization header format" };
  }

  if (!safeCompare(token, adminKey)) {
    return { valid: false, status: 401, message: "Invalid admin API key" };
  }

  return { valid: true };
}

/**
 * Verify cron authorization from the Authorization header.
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns { valid: true } or { valid: false, status: number, message: string }
 */
export function verifyCronAuth(
  authHeader: string | null
): { valid: true } | { valid: false; status: number; message: string } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return { valid: false, status: 500, message: "CRON_SECRET not configured" };
  }

  if (!authHeader) {
    return { valid: false, status: 401, message: "Missing Authorization header" };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return { valid: false, status: 401, message: "Invalid Authorization header format" };
  }

  if (!safeCompare(token, cronSecret)) {
    return { valid: false, status: 401, message: "Invalid cron secret" };
  }

  return { valid: true };
}

/**
 * Extract the token from a "Bearer <token>" header.
 */
function extractBearerToken(authHeader: string): string | null {
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}

/**
 * Constant-time string comparison to prevent timing attacks.
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
