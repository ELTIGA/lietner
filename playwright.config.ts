import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;
const CI = !!process.env.CI;

/**
 * End-to-end tests against the production build, run guest-only (sync variables blanked, as on
 * preview deploys). Animations default to Instant through prefers-reduced-motion so runs are steady.
 */
export default defineConfig({
  testDir: 'e2e',
  // Headless browsers render WebGL in software, so full sessions take a while. On a GPU-less CI
  // runner two workers share the CPU too: there the full-deck review took about 3.6 s per card in
  // Chromium (SwiftShader) and 70 s in iPad WebKit, and loading the sample deck about 5 s.
  timeout: CI ? 240_000 : 90_000,
  expect: { timeout: CI ? 20_000 : 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'reduce',
    // Recording a trace screencasts every frame, which slows software WebGL on CI runners a lot.
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
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
