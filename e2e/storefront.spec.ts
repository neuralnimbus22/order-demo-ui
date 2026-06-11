import { test, expect } from "@playwright/test";

// Storefront + cart against the REAL product-catalog through the BFF.
//
// Requires product-catalog reachable at PRODUCT_CATALOG_URL (default
// http://localhost:3005 — port-forward it first):
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//
// "Hardcover Notebook" (BK-001, $14.99) is part of the catalog's idempotent
// seed (see backend services/product-catalog/server.js), so it's a stable
// anchor for assertions.
const KNOWN = { sku: "BK-001", name: "Hardcover Notebook", price: "$14.99" };

test("storefront grid renders products from the catalog", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(20);
  await expect(
    page.getByTestId("product-card-name").filter({ hasText: KNOWN.name }),
  ).toBeVisible();
});

test("a card links through to the product detail with name and price", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("product-card")
    .filter({ has: page.getByText(KNOWN.name) })
    .getByTestId("product-card-link")
    .click();
  await page.waitForURL(`**/products/${KNOWN.sku}`);
  await expect(page.getByTestId("detail-name")).toHaveText(KNOWN.name);
  await expect(page.getByTestId("detail-price")).toHaveText(KNOWN.price);
});

test("adding to cart updates the header badge and the cart page", async ({
  page,
}) => {
  await page.goto(`/products/${KNOWN.sku}`);
  await page.getByTestId("detail-qty-increase").click(); // qty -> 2
  await page.getByTestId("detail-add").click();
  await expect(page.getByTestId("cart-badge-count")).toHaveText("2");

  await page.goto("/cart");
  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line.getByTestId("cart-line-name")).toHaveText(KNOWN.name);
  await expect(line.getByTestId("cart-line-qty")).toHaveText("2");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$29.98");
});

test("qty steppers and remove keep the subtotal correct", async ({ page }) => {
  // Two distinct seeded products via the grid's add buttons.
  await page.goto("/");
  const addFor = (name: string) =>
    page
      .getByTestId("product-card")
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByTestId("product-card-add");
  await addFor(KNOWN.name).click(); // $14.99
  await addFor("Gel Pen 5-pack").click(); // $6.49
  await expect(page.getByTestId("cart-badge-count")).toHaveText("2");

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$21.48");

  // Bump the notebook to qty 3: 3*14.99 + 6.49 = 51.46
  const notebook = page
    .getByTestId("cart-line")
    .filter({ has: page.getByText(KNOWN.name) });
  await notebook.getByTestId("cart-line-increase").click();
  await notebook.getByTestId("cart-line-increase").click();
  await expect(notebook.getByTestId("cart-line-qty")).toHaveText("3");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$51.46");

  // Remove the pens: back to 3*14.99 = 44.97
  await page
    .getByTestId("cart-line")
    .filter({ has: page.getByText("Gel Pen 5-pack") })
    .getByTestId("cart-line-remove")
    .click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$44.97");
});

test("the cart survives a reload (localStorage)", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("product-card")
    .filter({ has: page.getByText(KNOWN.name, { exact: true }) })
    .getByTestId("product-card-add")
    .click();
  await expect(page.getByTestId("cart-badge-count")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("cart-badge-count")).toHaveText("1");

  await page.goto("/cart");
  await expect(
    page.getByTestId("cart-line").getByTestId("cart-line-name"),
  ).toHaveText(KNOWN.name);
});
