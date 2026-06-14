// Mirror of e2e/auth.spec.ts (Playwright) / cypress/e2e/auth.cy.ts.
// Auth flows against the REAL user-session service through the BFF.
//
// Requires user-session reachable at USER_SESSION_URL (default
// http://localhost:3006 — port-forward it first):
//   kubectl -n order-demo port-forward svc/user-session 3006:3006 &
//
// Seeded demo credentials come from the backend's user-session seed.

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  type as typeInto,
  click,
  login,
  loginAsDemo,
  waitVisible,
  waitText,
  waitUrl,
  text,
  hasSessionCookie,
  SEEDED,
} from "./driver";

describe("auth", () => {
  let driver: WebDriver;
  before(async () => {
    driver = await buildDriver();
  });
  after(async () => {
    if (driver) await driver.quit();
  });
  beforeEach(async () => {
    await resetState(driver);
  });

  it("login with the seeded demo user lands on /account, header shows the email", async () => {
    await login(driver);
    await waitUrl(driver, (u) => u.pathname === "/account");
    assert.equal(await text(driver, "header-email"), SEEDED.email);
    assert.equal(await text(driver, "account-email"), SEEDED.email);
  });

  it("wrong password shows a generic error, sets no cookie, stays on /login", async () => {
    await login(driver, SEEDED.email, "definitely-not-the-password");
    await waitText(driver, "login-error", "Invalid email or password.");
    assert.equal(new URL(await driver.getCurrentUrl()).pathname, "/login");
    assert.equal(await hasSessionCookie(driver), false);
  });

  it("register a fresh account, then log in with it", async () => {
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = "e2e-password-123";

    await get(driver, "/register");
    await typeInto(driver, "register-email", email);
    await typeInto(driver, "register-password", password);
    await typeInto(driver, "register-confirm", password);
    await click(driver, "register-submit");

    // No auto-login by design: success routes to /login with a notice.
    await waitUrl(
      driver,
      (u) => u.pathname === "/login" && u.search === "?registered=1",
    );
    await waitVisible(driver, "register-success");

    await typeInto(driver, "login-email", email);
    await typeInto(driver, "login-password", password);
    await click(driver, "login-submit");
    await waitUrl(driver, (u) => u.pathname === "/account");
    assert.equal(await text(driver, "header-email"), email);
  });

  it("registering the seeded email shows the already-exists message", async () => {
    await get(driver, "/register");
    await typeInto(driver, "register-email", SEEDED.email);
    await typeInto(driver, "register-password", "whatever-password");
    await typeInto(driver, "register-confirm", "whatever-password");
    await click(driver, "register-submit");
    await waitText(
      driver,
      "register-error",
      "An account with this email already exists.",
    );
    assert.equal(new URL(await driver.getCurrentUrl()).pathname, "/register");
  });

  it("logout clears the session and the header returns to logged out", async () => {
    await loginAsDemo(driver);

    await click(driver, "header-logout");
    await waitUrl(driver, (u) => u.pathname === "/");
    await waitVisible(driver, "header-login");
    assert.equal(await hasSessionCookie(driver), false);

    // The protected route agrees the session is gone.
    await get(driver, "/account");
    await waitUrl(driver, (u) => u.pathname === "/login");
  });

  it("visiting the protected route logged out redirects to /login", async () => {
    await get(driver, "/account");
    await waitUrl(driver, (u) => u.pathname === "/login");
    await waitVisible(driver, "login-email");
  });
});
