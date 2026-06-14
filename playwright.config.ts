import { defineConfig, devices } from "@playwright/test";

// E2E target convention (shared across every UI-test framework — Playwright
// now, Cypress and Selenium next, all later wired into TestKube):
//
//   The app is assumed to be ALREADY RUNNING at E2E_BASE_URL. The harness does
//   NOT start it. Default target when unset: http://localhost:3000.
//
// Local run:    start `npm run dev` (+ the five backend port-forwards the
//               backend-touching specs need), then `npm run test:e2e`.
// Deployed run: E2E_BASE_URL=<deployed-ui-url> npm run test:e2e
//
// There is intentionally no webServer block — pointing at a running target is
// the only mode, so Playwright behaves like Cypress/Selenium/TestKube will.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
