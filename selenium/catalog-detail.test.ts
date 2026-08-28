// Catalog detail coverage: every card on the storefront must open a detail
// page that shows the same name and price the card showed. Reads the catalog
// at run time, so no product names are hardcoded.

import assert from "node:assert/strict";
import { By, type WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  waitVisible,
  waitCountAtLeast,
  waitUrl,
  text,
} from "./driver";

const card = (i: number) =>
  By.xpath(`(//*[@data-testid='product-card'])[${i + 1}]`);
const inCard = (i: number, testid: string) =>
  By.xpath(`(//*[@data-testid='product-card'])[${i + 1}]//*[@data-testid='${testid}']`);

describe("catalog detail", () => {
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

  for (let i = 0; i < 6; i++) {
    it(`product card ${i + 1} opens a detail page with the same name and price`, async () => {
      await get(driver, "/");
      await waitCountAtLeast(driver, "product-card", i + 1);
      await driver.findElement(card(i));
      const name = (await driver.findElement(inCard(i, "product-card-name")).getText()).trim();
      const price = (await driver.findElement(inCard(i, "product-card-price")).getText()).trim();
      await driver.findElement(inCard(i, "product-card-link")).click();
      await waitUrl(driver, (u) => u.pathname.startsWith("/products/"));
      assert.equal(await text(driver, "detail-name"), name);
      assert.equal(await text(driver, "detail-price"), price);
      await waitVisible(driver, "detail-add");
    });
  }

  it("an unknown sku shows the product-not-found page", async () => {
    await get(driver, "/products/NO-SUCH-SKU-000");
    await waitVisible(driver, "product-not-found");
  });
});
