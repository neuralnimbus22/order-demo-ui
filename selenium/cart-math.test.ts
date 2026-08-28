// Cart arithmetic beyond the storefront basics: detail-page quantity stepper,
// per-line totals, the empty state after the last removal, and the checkout
// summary matching the cart. Prices come from the catalog's idempotent seed.

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  clickBy,
  loginAsDemo,
  waitVisible,
  waitText,
  waitTextBy,
  waitCountAtLeast,
  count,
  inCardByName,
  inCartLineByName,
  KNOWN,
} from "./driver";

const PENS = "Gel Pen 5-pack"; // $6.49 in the seed

describe("cart math", () => {
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

  it("the detail page quantity stepper adds the chosen quantity", async () => {
    await get(driver, `/products/${KNOWN.sku}`);
    await click(driver, "detail-qty-increase");
    await click(driver, "detail-qty-increase");
    await waitText(driver, "detail-qty", "3");
    await click(driver, "detail-add");
    await waitText(driver, "cart-badge-count", "3");
    await get(driver, "/cart");
    await waitTextBy(driver, inCartLineByName(KNOWN.name, "cart-line-qty"), "3");
    await waitText(driver, "cart-subtotal", "$44.97");
  });

  it("each cart line total is quantity times unit price", async () => {
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add")); // 14.99
    await clickBy(driver, inCardByName(PENS, "product-card-add")); // 6.49
    await waitText(driver, "cart-badge-count", "2");
    await get(driver, "/cart");
    await waitCountAtLeast(driver, "cart-line", 2);
    await clickBy(driver, inCartLineByName(PENS, "cart-line-increase"));
    await clickBy(driver, inCartLineByName(PENS, "cart-line-increase"));
    await waitTextBy(driver, inCartLineByName(PENS, "cart-line-qty"), "3");
    await waitTextBy(driver, inCartLineByName(PENS, "cart-line-total"), "$19.47");
    await waitTextBy(driver, inCartLineByName(KNOWN.name, "cart-line-total"), "$14.99");
    await waitText(driver, "cart-subtotal", "$34.46");
  });

  it("removing the last line shows the empty cart state", async () => {
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add"));
    await waitText(driver, "cart-badge-count", "1");
    await get(driver, "/cart");
    await waitCountAtLeast(driver, "cart-line", 1);
    await clickBy(driver, inCartLineByName(KNOWN.name, "cart-line-remove"));
    await waitVisible(driver, "cart-empty");
    assert.equal(await count(driver, "cart-line"), 0);
  });

  it("the checkout summary matches the cart", async () => {
    await loginAsDemo(driver);
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add"));
    await waitText(driver, "cart-badge-count", "1");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add"));
    await waitText(driver, "cart-badge-count", "2");
    await get(driver, "/checkout");
    await waitVisible(driver, "checkout-lines");
    assert.equal(await count(driver, "checkout-line"), 1);
    await waitText(driver, "checkout-total", "$29.98");
  });
});
