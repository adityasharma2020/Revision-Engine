import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'UPSC Revision Engine',
        short_name: 'Revision',
        description: 'A calm, offline-first revision system for UPSC preparation.',
        theme_color: '#5b5bd6',
        background_color: '#0d0d0f',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Chapter JSON + manifest: serve cached-first, refresh in the background,
        // so the library and every opened chapter work fully offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/chapters/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'chapter-content',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
