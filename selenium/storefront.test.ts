// Mirror of e2e/storefront.spec.ts (Playwright) / cypress/e2e/storefront.cy.ts.
// Storefront + cart against the REAL product-catalog through the BFF.
//
// Requires product-catalog reachable at PRODUCT_CATALOG_URL (default
// http://localhost:3005 — port-forward it first):
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//
// "Hardcover Notebook" (BK-001, $14.99) is part of the catalog's idempotent
// seed, so it's a stable anchor for assertions.

import assert from "node:assert/strict";
import { By, until, type WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  clickBy,
  waitVisible,
  waitText,
  waitTextBy,
  waitUrl,
  waitCountAtLeast,
  count,
  text,
  inCardByName,
  inCartLineByName,
  KNOWN,
} from "./driver";

describe("storefront", () => {
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

  it("storefront grid renders products from the catalog", async () => {
    await get(driver, "/");
    await waitCountAtLeast(driver, "product-card", 20);
    assert.ok((await count(driver, "product-card")) >= 20);
    // The known product's name appears in the grid.
    await driver.wait(
      until.elementLocated(
        By.xpath(
          `//*[@data-testid='product-card-name'][normalize-space()='${KNOWN.name}']`,
        ),
      ),
      10000,
    );
  });

  it("a card links through to the product detail with name and price", async () => {
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-link"));
    await waitUrl(driver, (u) => u.pathname === `/products/${KNOWN.sku}`);
    assert.equal(await text(driver, "detail-name"), KNOWN.name);
    assert.equal(await text(driver, "detail-price"), KNOWN.price);
  });

  it("adding to cart updates the header badge and the cart page", async () => {
    await get(driver, `/products/${KNOWN.sku}`);
    await click(driver, "detail-qty-increase"); // qty -> 2
    await click(driver, "detail-add");
    await waitText(driver, "cart-badge-count", "2");

    await get(driver, "/cart");
    assert.equal(await count(driver, "cart-line"), 1);
    await waitText(driver, "cart-line-name", KNOWN.name);
    await waitText(driver, "cart-line-qty", "2");
    await waitText(driver, "cart-subtotal", "$29.98");
  });

  it("qty steppers and remove keep the subtotal correct", async () => {
    // Two distinct seeded products via the grid's add buttons.
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add")); // $14.99
    await clickBy(driver, inCardByName("Gel Pen 5-pack", "product-card-add")); // $6.49
    await waitText(driver, "cart-badge-count", "2");

    await get(driver, "/cart");
    assert.equal(await count(driver, "cart-line"), 2);
    await waitText(driver, "cart-subtotal", "$21.48");

    // Bump the notebook to qty 3: 3*14.99 + 6.49 = 51.46
    await clickBy(driver, inCartLineByName(KNOWN.name, "cart-line-increase"));
    await clickBy(driver, inCartLineByName(KNOWN.name, "cart-line-increase"));
    await waitTextBy(driver, inCartLineByName(KNOWN.name, "cart-line-qty"), "3");
    await waitText(driver, "cart-subtotal", "$51.46");

    // Remove the pens: back to 3*14.99 = 44.97
    await clickBy(driver, inCartLineByName("Gel Pen 5-pack", "cart-line-remove"));
    await driver.wait(
      async () => (await count(driver, "cart-line")) === 1,
      10000,
    );
    await waitText(driver, "cart-subtotal", "$44.97");
  });

  it("the cart survives a reload (localStorage)", async () => {
    await get(driver, "/");
    await clickBy(driver, inCardByName(KNOWN.name, "product-card-add"));
    await waitText(driver, "cart-badge-count", "1");

    await driver.navigate().refresh();
    await waitText(driver, "cart-badge-count", "1");

    await get(driver, "/cart");
    await waitText(driver, "cart-line-name", KNOWN.name);
  });
});
