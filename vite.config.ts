import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // three.js alone is ~600 kB minified; one chunk is fine for a static app cached by the service worker.
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      // Updates wait for the user: the app shows a "new version" toast, never mid-review.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Lietner',
        short_name: 'Lietner',
        description: 'Leitner-system flashcards on a 3D desk. Free, works offline, no account needed.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#15110e',
        background_color: '#15110e',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything a guest needs offline, including the Latin font files. Other font subsets
        // and the sign-in SDK chunk are cached the first time they're used.
        globPatterns: ['**/*.{html,css,svg,png,ico}', 'assets/*.js', 'assets/*-latin-[0-9]*.woff2', 'assets/*-latin-ext-*.woff2'],
        globIgnores: ['assets/session-*.js', 'assets/sentry-*.js'],
        navigateFallback: 'index.html',
        // The legal pages are their own documents, served from the precache by their clean URLs.
        navigateFallbackDenylist: [/^\/privacy/, /^\/terms/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.+\.(?:js|woff2?)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'lietner-assets', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
