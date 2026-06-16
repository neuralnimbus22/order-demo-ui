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
      // Functional suite — the fast, deterministic specs. Ignores the
      // accessibility spec AND the slow live-backend convergence spec, so
      // `playwright test --project=chromium` (npm run test:e2e) runs exactly the
      // fast functional tests, unchanged.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/a11y.spec.ts", "**/convergence.spec.ts"],
    },
    {
      // Accessibility (axe-core) — a different test TYPE, isolated in its own
      // project so it runs only via `playwright test --project=a11y`
      // (npm run test:a11y) and never mixes into the functional run.
      name: "a11y",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/a11y.spec.ts",
    },
    {
      // Live-backend convergence — intentionally SLOW (real Kafka convergence),
      // isolated so it runs only via `playwright test --project=convergence`
      // (npm run test:e2e:convergence) and never slows the fast functional run.
      name: "convergence",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/convergence.spec.ts",
    },
  ],
});
