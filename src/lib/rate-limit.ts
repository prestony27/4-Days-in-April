/**
 * Distributed rate limiter using Upstash Redis.
 *
 * This provides consistent rate limiting across all serverless instances,
 * unlike in-memory rate limiting which resets on cold starts.
 *
 * Rate limits:
 * - submit-team: 5/minute
 * - my-teams: 15/minute
 * - 429 response: { "detail": "Too many requests. Please try again later." }
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";

// Cache rate limiter instances by configuration
const rateLimiters = new Map<string, Ratelimit>();

function getRateLimiter(limit: number, windowSec: number): Ratelimit {
  const key = `${limit}:${windowSec}`;
  let limiter = rateLimiters.get(key);

  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: "ratelimit",
    });
    rateLimiters.set(key, limiter);
  }

  return limiter;
}

/**
 * Check if a request is rate limited.
 * @param key - Unique identifier (typically "endpoint:ip")
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns { limited: false } if allowed, or { limited: true, retryAfter: number } if blocked
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): Promise<{ limited: false } | { limited: true; retryAfter: number }> {
  const windowSec = Math.ceil(windowMs / 1000);
  const limiter = getRateLimiter(limit, windowSec);

  const { success, reset } = await limiter.limit(key);

  if (success) {
    return { limited: false };
  }

  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return { limited: true, retryAfter: Math.max(1, retryAfter) };
}

/**
 * Get the client IP address from request headers.
 * Handles X-Forwarded-For for proxied requests (Vercel).
 */
export function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Can be comma-separated list; first is the client
    return forwarded.split(",")[0].trim();
  }

  // Fallback for local development
  return "127.0.0.1";
}

/**
 * Create a 429 Too Many Requests response matching the current API format.
 */
export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ detail: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Rate limit configurations
export const RATE_LIMITS = {
  submitTeam: { limit: 5, windowMs: 60 * 1000 }, // 5/minute
  myTeams: { limit: 15, windowMs: 60 * 1000 }, // 15/minute
} as const;
