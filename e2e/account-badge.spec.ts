import { test, expect, type Page } from "@playwright/test";

// Account order-count badge. The badge reads the placed-order store from
// localStorage (sundry-orders-v1) via lib/order-count, so we seed a few orders
// before any app script runs (addInitScript, the same pattern the convergence
// spec uses for its synthetic fixture) and assert the badge reflects the count.
// This is backend-free — it exercises the client badge + getOrderCount only;
// only the seeded demo login touches a backend service.
const SEEDED_EMAIL = "demo@example.com";
const SEEDED_PASSWORD = "demo-password";

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(SEEDED_EMAIL);
  await page.getByTestId("login-password").fill(SEEDED_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/account");
}

// Seed N placed orders into localStorage before the page's own scripts run, so
// /account reads them straight back. Shape matches lib/orders' PlacedOrder.
function seedOrders(page: Page, count: number) {
  return page.addInitScript((n) => {
    const orders = Array.from({ length: n }, (_, i) => ({
      id: `seed-${i}`,
      sku: "BK-001",
      name: "Hardcover Notebook",
      qty: 1,
      amount: 14.99,
      status: "placed",
      trackable: true,
      placedAt: "2026-06-13T12:00:00.000Z",
      batchId: `seed-${i}`,
    }));
    window.localStorage.setItem("sundry-orders-v1", JSON.stringify(orders));
  }, count);
}

test("account page shows the order-count badge with the placed-order count", async ({
  page,
}) => {
  await seedOrders(page, 3);
  await logIn(page);
  await page.goto("/account");

  const badge = page.getByTestId("account-order-badge");
  await expect(badge).toBeVisible();
  // The badge links to the orders list.
  await expect(badge).toHaveAttribute("href", "/orders");
  await expect(page.getByTestId("account-order-badge-count")).toHaveText("3");
});

test("the badge count reflects a single placed order", async ({ page }) => {
  await seedOrders(page, 1);
  await logIn(page);
  await page.goto("/account");

  await expect(page.getByTestId("account-order-badge-count")).toHaveText("1");
});
