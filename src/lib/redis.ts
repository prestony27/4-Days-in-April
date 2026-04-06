/**
 * Upstash Redis client singleton for distributed rate limiting.
 * Uses REST API, making it ideal for serverless environments.
 */

import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables"
    );
  }

  client = new Redis({ url, token });
  return client;
}
