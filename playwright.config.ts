import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;
const CI = !!process.env.CI;

/**
 * End-to-end tests against the production build, run guest-only (sync variables blanked, as on
 * preview deploys). Animations default to Instant through prefers-reduced-motion so runs are steady.
 */
export default defineConfig({
  testDir: 'e2e',
  // Headless browsers render WebGL in software, so full sessions take a while.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_GOOGLE_CLIENT_ID= VITE_SENTRY_DSN= npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, testIgnore: /textmode/ },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testIgnore: /textmode/ },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] }, testIgnore: /textmode/ },
    {
      name: 'no-webgl',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] } },
      testMatch: /textmode/,
    },
  ],
});
