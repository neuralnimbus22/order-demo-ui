// Navigation and form scaffolding: header links, the login and register
// forms, client-side validation, and the empty cart page.

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  type as typeInto,
  waitVisible,
  waitText,
  waitUrl,
  count,
} from "./driver";

describe("navigation", () => {
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

  it("the brand link returns to the storefront from the cart page", async () => {
    await get(driver, "/cart");
    await click(driver, "header-brand");
    await waitUrl(driver, (u) => u.pathname === "/");
    await waitVisible(driver, "product-grid");
  });

  it("the header login link opens the login form", async () => {
    await get(driver, "/");
    await click(driver, "header-login");
    await waitUrl(driver, (u) => u.pathname === "/login");
    await waitVisible(driver, "login-email");
    await waitVisible(driver, "login-password");
    await waitVisible(driver, "login-submit");
  });

  it("the header register link opens the registration form", async () => {
    await get(driver, "/");
    await click(driver, "header-register");
    await waitUrl(driver, (u) => u.pathname === "/register");
    await waitVisible(driver, "register-email");
    await waitVisible(driver, "register-password");
    await waitVisible(driver, "register-confirm");
    await waitVisible(driver, "register-submit");
  });

  it("mismatched passwords are rejected before anything is sent", async () => {
    await get(driver, "/register");
    await typeInto(driver, "register-email", `e2e-${Date.now()}@example.com`);
    await typeInto(driver, "register-password", "e2e-password-123");
    await typeInto(driver, "register-confirm", "e2e-password-456");
    await click(driver, "register-submit");
    await waitText(driver, "register-error", "Passwords do not match.");
    assert.equal(new URL(await driver.getCurrentUrl()).pathname, "/register");
  });

  it("the empty cart page has no checkout button", async () => {
    await get(driver, "/cart");
    await waitVisible(driver, "cart-empty");
    assert.equal(await count(driver, "cart-checkout"), 0);
  });
});
