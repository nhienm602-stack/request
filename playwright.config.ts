import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * These specs drive a real browser against a real Next.js server, so they cover
 * what the component tests cannot: the actual HTTP round trip, the Server
 * Action boundary, and the files that land on disk.
 *
 * Specs use `.spec.ts` (Vitest owns `.test.ts`) so the two runners never try to
 * execute each other's files.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
// `localhost`, not `127.0.0.1`: Next.js 16 blocks cross-origin requests to dev
// resources, and the two are distinct origins. Hitting the wrong one silently
// starves the page of its client bundle, so the wizard never hydrates and every
// spec sees only the pre-hydration skeleton.
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  // A refund submission is a linear flow with server-side side effects; running
  // the specs in parallel against one server invites interference for no gain.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    // Turbopack compiles each route on first request, so the first navigation
    // can be slow on a cold start.
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
