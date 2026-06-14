// Mirror of e2e/smoke.spec.ts (Playwright) / cypress/e2e/smoke.cy.ts.
// Scaffold smoke: the app serves and its liveness route answers. Neither check
// needs the backend up — /api/health is deliberately liveness-only.
//
// Target comes from E2E_BASE_URL (default http://localhost:3000); the app is
// assumed already running. See README "End-to-end tests".

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import { buildDriver, get, waitVisible, BASE_URL } from "./driver";

describe("smoke", () => {
  let driver: WebDriver;
  before(async () => {
    driver = await buildDriver();
  });
  after(async () => {
    if (driver) await driver.quit();
  });

  it("home page renders the brand", async () => {
    await get(driver, "/");
    const brand = await waitVisible(driver, "header-brand");
    // The brand is CSS text-transform:uppercase, so Selenium's getText() would
    // return the RENDERED "SUNDRY". Assert on the DOM textContent ("Sundry") to
    // match what Playwright/Cypress compare (their text checks read textContent,
    // not the CSS-transformed rendering).
    const dom = (await brand.getAttribute("textContent")).trim();
    assert.equal(dom, "Sundry");
  });

  it("GET /api/health returns ok", async () => {
    // Node fetch — the Selenium equivalent of Playwright's request.get; no
    // browser navigation needed for a pure API check.
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});
