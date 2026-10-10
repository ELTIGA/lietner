import { defineConfig } from 'vitest/config';

export default defineConfig({
  // three.js alone is ~600 kB minified; one chunk is fine for a local static app.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
