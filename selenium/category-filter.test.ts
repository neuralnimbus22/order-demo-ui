// Category filter on the storefront. The filter is client side, so every
// category button must narrow the grid to a subset and "All" must restore it.

import assert from "node:assert/strict";
import { By, type WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  waitVisible,
  waitCountAtLeast,
  waitUrl,
  count,
} from "./driver";

const buttons = By.css("[data-testid='category-filter'] button");

describe("category filter", () => {
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

  async function nthButton(i: number) {
    return (await driver.findElements(buttons))[i];
  }

  it("every category button narrows the grid to a subset of the catalog", async () => {
    await get(driver, "/");
    await waitCountAtLeast(driver, "product-card", 20);
    const total = await count(driver, "product-card");
    const n = (await driver.findElements(buttons)).length;
    assert.ok(n >= 2, "expected an All button plus at least one category");
    for (let i = 1; i < n; i++) {
      await (await nthButton(i)).click();
      await driver.wait(async () => {
        const c = await count(driver, "product-card");
        return c > 0 && c < total;
      }, 10000, `category ${i} did not narrow the grid`);
    }
  });

  it("selecting All restores the full catalog", async () => {
    await get(driver, "/");
    await waitCountAtLeast(driver, "product-card", 20);
    const total = await count(driver, "product-card");
    await (await nthButton(1)).click();
    await driver.wait(async () => (await count(driver, "product-card")) < total, 10000);
    await (await nthButton(0)).click();
    await driver.wait(async () => (await count(driver, "product-card")) === total, 10000);
  });

  it("a filtered card still links through to its detail page", async () => {
    await get(driver, "/");
    await waitCountAtLeast(driver, "product-card", 20);
    const total = await count(driver, "product-card");
    await (await nthButton(1)).click();
    await driver.wait(async () => (await count(driver, "product-card")) < total, 10000);
    await driver.findElement(By.css("[data-testid='product-card-link']")).click();
    await waitUrl(driver, (u) => u.pathname.startsWith("/products/"));
    await waitVisible(driver, "detail-name");
  });
});
