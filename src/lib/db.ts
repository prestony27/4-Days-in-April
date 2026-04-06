/**
 * Supabase client singleton for server-side database operations.
 * Uses the service role key for full admin access (bypasses RLS).
 *
 * For high-concurrency environments, set SUPABASE_POOLER_URL to use
 * Supabase's connection pooling (Supavisor). Enable in:
 * Supabase Dashboard > Settings > Database > Connection Pooling
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  // Use pooler URL if available for better connection management
  // in serverless environments with high concurrency
  const url = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/SUPABASE_POOLER_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
