/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_GUEST_MODE?: string;
  readonly VITE_AUTH_PROVIDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
