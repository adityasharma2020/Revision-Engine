import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

/**
 * Lazily-created Supabase client singleton.
 *
 * Returns null when credentials are absent, so the app degrades to local/guest
 * mode instead of crashing. Session is persisted and auto-refreshed by the SDK.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!env.supabaseConfigured) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
