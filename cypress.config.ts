import { defineConfig } from "cypress";

// E2E target convention (shared with Playwright — see playwright.config.ts and
// README "End-to-end tests"): the app is assumed ALREADY RUNNING at
// E2E_BASE_URL (default http://localhost:3000). Cypress never starts it — there
// is no dev-server config here on purpose. Cypress verifies baseUrl is
// reachable at startup, which enforces "app already running".
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  e2e: {
    baseUrl,
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: false,
    // The convergence flow can take ~20s against a real backend; individual
    // assertions set their own { timeout } where needed. Keep defaults modest.
    defaultCommandTimeout: 6000,
    video: false,
    screenshotOnRunFailure: false,
    retries: { runMode: 2, openMode: 0 },
  },
});
