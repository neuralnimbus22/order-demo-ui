// Signed-in account area: the account page, the orders link, the orders
// list, and the signed-out guard on /orders.

import assert from "node:assert/strict";
import { By, type WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  loginAsDemo,
  waitVisible,
  waitAbsent,
  waitUrl,
  text,
  SEEDED,
} from "./driver";

describe("account", () => {
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

  it("the account page shows the signed-in email", async () => {
    await loginAsDemo(driver);
    assert.equal(await text(driver, "account-email"), SEEDED.email);
    assert.equal(await text(driver, "header-email"), SEEDED.email);
  });

  it("the header links to the orders page when signed in", async () => {
    await loginAsDemo(driver);
    await click(driver, "header-orders");
    await waitUrl(driver, (u) => u.pathname === "/orders");
    await driver.wait(
      async () =>
        (await driver.findElements(By.css("[data-testid='orders-list'],[data-testid='orders-empty']"))).length > 0,
      10000,
    );
  });

  it("the orders page redirects to login when signed out", async () => {
    await get(driver, "/orders");
    await waitUrl(driver, (u) => u.pathname === "/login");
    await waitVisible(driver, "login-email");
  });

  it("logout returns the header to the signed-out state", async () => {
    await loginAsDemo(driver);
    await click(driver, "header-logout");
    await waitVisible(driver, "header-login");
    await waitAbsent(driver, "header-email");
  });
});
