import { test, expect, type Page } from "@playwright/test";

// Checkout (the correlation-id flow) against the REAL backend through the BFF.
//
// Requires these services reachable at their *_URL envs (defaults are the
// local port-forwards below):
//   kubectl -n order-demo port-forward svc/user-session    3006:3006 &
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//   kubectl -n order-demo port-forward svc/order           3002:3002 &
//   kubectl -n order-demo port-forward svc/payment         3004:3004 &
//   kubectl -n order-demo port-forward svc/inventory       3003:3003 &
//
// Seeded demo login comes from the backend's user-session seed.
const SEEDED_EMAIL = "demo@example.com";
const SEEDED_PASSWORD = "demo-password";
const KNOWN = { sku: "BK-001", name: "Hardcover Notebook" };

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(SEEDED_EMAIL);
  await page.getByTestId("login-password").fill(SEEDED_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/account");
}

async function addKnownItem(page: Page) {
  await page.goto(`/products/${KNOWN.sku}`);
  await page.getByTestId("detail-add").click();
  await expect(page.getByTestId("cart-badge-count")).toHaveText("1");
}

test("logged-out /checkout redirects to /login", async ({ page }) => {
  await page.goto("/checkout");
  await page.waitForURL("**/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
});

test("logged-in /checkout with an empty cart shows the empty state", async ({
  page,
}) => {
  await logIn(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-empty")).toBeVisible();
  // No order was placed.
  await expect(page).toHaveURL(/\/checkout$/);
});

test("happy path: place an order, confirmation shows the id, cart clears", async ({
  page,
}) => {
  await logIn(page);
  await addKnownItem(page);

  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-line")).toHaveCount(1);

  // The BFF route is what the browser calls — order/payment are never hit
  // directly from the page.
  const checkoutCall = page.waitForResponse(
    (r) => r.url().includes("/api/checkout") && r.request().method() === "POST",
  );
  await page.getByTestId("place-order").click();
  const res = await checkoutCall;
  expect(res.status()).toBe(200);

  // Lands on the confirmation with the placed order id shown.
  await page.waitForURL(/\/orders\?placed=/);
  await expect(page.getByTestId("checkout-confirmation")).toBeVisible();
  const orderId = page.getByTestId("order-id").first();
  await expect(orderId).toBeVisible();
  expect((await orderId.textContent())?.trim().length).toBeGreaterThan(0);

  // Cart is cleared (badge gone).
  await expect(page.getByTestId("cart-badge-count")).toHaveCount(0);
});

test("a placed order is real and trackable toward fulfilled", async ({
  page,
}) => {
  await logIn(page);
  await addKnownItem(page);
  await page.goto("/checkout");
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/orders\?placed=/);

  // Open the order's status view and confirm it converges. Both order-placed
  // and payment-confirmed were sent for the same id, so inventory fulfills it.
  // (Deep convergence assertions are chunk 5; here we just prove trackability.)
  await page.getByTestId("order-row").first().click();
  await page.waitForURL(/\/orders\/.+/);
  await expect(page.getByTestId("order-detail-id")).toBeVisible();
  await expect(page.getByTestId("order-badge-fulfilled")).toBeVisible({
    timeout: 20_000,
  });
});
