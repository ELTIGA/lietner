import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { contentPages, loadPages, pageInputs } from './build/content.ts';

// Guides and comparisons, written in content/*.md and built into plain HTML pages.
const pages = loadPages('content');

export default defineConfig({
  // three.js alone is ~600 kB minified; one chunk is fine for a static app cached by the service worker.
  build: {
    chunkSizeWarningLimit: 900,
    // The legal, donation and guide pages are plain documents next to the app, served at /privacy, /terms, /support and /<slug>.
    rollupOptions: { input: { main: 'index.html', privacy: 'privacy.html', terms: 'terms.html', support: 'support.html', ...pageInputs(pages) } },
  },
  plugins: [
    contentPages(pages),
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
        globIgnores: ['assets/session-*.js', 'assets/sentry-*.js', 'og.jpg'],
        navigateFallback: 'index.html',
        // The app lives only at / (dev flags like ?mode=text included). Every other page is its own document,
        // served from the precache by its clean URL, so guides published later work even on an older worker.
        navigateFallbackAllowlist: [/^\/(?:$|\?)/],
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
    // Playwright owns e2e/.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
