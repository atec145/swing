// Server-side Supabase client.
//
// The shared Supabase project (with sarah-todo) is reached through Next.js API
// routes; the browser never talks to Supabase directly, so the service-role
// key stays on the server.
//
// NEVER import this module from a client component.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Lazily create a server-side Supabase client using the service role key.
 * Throws if the required environment variables are missing.
 */
export function getServerSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    )
  }

  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _client
}
