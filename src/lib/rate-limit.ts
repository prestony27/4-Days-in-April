/**
 * Simple in-memory rate limiter for serverless functions.
 *
 * Note: This is per-instance and will reset on cold starts.
 * For production at scale, consider @upstash/ratelimit with Redis.
 *
 * This preserves the current FastAPI rate limiting behavior:
 * - submit-team: 5/minute
 * - my-teams: 15/minute
 * - 429 response: { "detail": "Too many requests. Please try again later." }
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}

/**
 * Check if a request is rate limited.
 * @param key - Unique identifier (typically IP address)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns { limited: false } if allowed, or { limited: true, retryAfter: number } if blocked
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): { limited: false } | { limited: true; retryAfter: number } {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  entry.count++;
  return { limited: false };
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

// Rate limit configurations matching Python backend
export const RATE_LIMITS = {
  submitTeam: { limit: 5, windowMs: 60 * 1000 },   // 5/minute
  myTeams: { limit: 15, windowMs: 60 * 1000 },     // 15/minute
} as const;
