/**
 * Typed, validated access to environment variables.
 *
 * Only VITE_-prefixed vars exist in the browser bundle. Supabase's anon key is
 * public by design (protected by Row Level Security) — never place a secret here.
 * When Supabase vars are absent, the app runs in local/guest-only mode.
 */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  return value === 'true' || value === '1';
}

const supabaseUrl = str(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = str(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const env = {
  appName: str(import.meta.env.VITE_APP_NAME, 'UPSC Revision Engine'),
  environment: str(import.meta.env.VITE_ENVIRONMENT, 'development'),
  analyticsEnabled: bool(import.meta.env.VITE_ENABLE_ANALYTICS, false),

  supabaseUrl,
  supabaseAnonKey,
  /** True only when both Supabase credentials are present. */
  supabaseConfigured: supabaseUrl !== '' && supabaseAnonKey !== '',

  guestModeEnabled: bool(import.meta.env.VITE_ENABLE_GUEST_MODE, true),
  authProviders: str(import.meta.env.VITE_AUTH_PROVIDERS, 'google,email')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
} as const;

export type AppEnv = typeof env;
