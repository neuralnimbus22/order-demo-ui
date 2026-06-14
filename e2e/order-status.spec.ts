import { test, expect, type Page } from "@playwright/test";

// Order-status convergence view (/orders/[id]).
//
// The happy-path test drives the REAL backend through the BFF and needs the
// five services port-forwarded (same as e2e/checkout.spec.ts):
//   kubectl -n order-demo port-forward svc/user-session    3006:3006 &
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//   kubectl -n order-demo port-forward svc/order           3002:3002 &
//   kubectl -n order-demo port-forward svc/payment         3004:3004 &
//   kubectl -n order-demo port-forward svc/inventory       3003:3003 &
//
// The rejected-order test uses a SYNTHETIC localStorage fixture (an order with
// status:"rejected", trackable:false) rather than driving a real backend
// rejection — forcing a genuine rejection would mean breaking a backend service
// mid-test, which is out of scope here. It verifies the terminal presentation
// and that a non-trackable order does NOT poll.
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

test("convergence timeline reaches order-placed, payment-confirmed, fulfilled", async ({
  page,
}) => {
  await logIn(page);
  await page.goto(`/products/${KNOWN.sku}`);
  await page.getByTestId("detail-add").click();
  await page.goto("/checkout");
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/orders\?placed=/);

  await page.getByTestId("order-row").first().click();
  await page.waitForURL(/\/orders\/.+/);

  // Both events converge (same id sent to order + payment), so the first two
  // steps reach "done" and the order reaches a terminal fulfilled state.
  await expect(page.getByTestId("timeline-step-order")).toHaveAttribute(
    "data-state",
    "done",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("timeline-step-payment")).toHaveAttribute(
    "data-state",
    "done",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("timeline-step-fulfilled")).toHaveAttribute(
    "data-state",
    "done",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("terminal-fulfilled")).toBeVisible();
  await expect(page.getByTestId("order-badge-fulfilled")).toBeVisible();
  // Polling stops once fulfilled.
  await expect(page.getByTestId("order-polling")).toHaveCount(0);
});

test("a rejected order shows the terminal couldn't-place state and does NOT poll", async ({
  page,
}) => {
  await logIn(page);

  // Synthetic fixture: seed a rejected (non-trackable) order before any app
  // script runs, so /orders/[id] reads it straight from localStorage.
  const rejectedId = "rejected-fixture-0001";
  await page.addInitScript(
    ([id]) => {
      const order = {
        id,
        sku: "BK-001",
        name: "Hardcover Notebook",
        qty: 1,
        amount: 14.99,
        status: "rejected",
        detail: "This item is no longer available.",
        trackable: false,
        placedAt: "2026-06-13T12:00:00.000Z",
        batchId: id,
      };
      window.localStorage.setItem("sundry-orders-v1", JSON.stringify([order]));
    },
    [rejectedId],
  );

  // Fail the test if the page ever polls a non-trackable order.
  let polled = false;
  await page.route("**/api/orders/*/status", (route) => {
    polled = true;
    route.fulfill({ status: 200, body: "{}" });
  });

  await page.goto(`/orders/${rejectedId}`);
  await expect(page.getByTestId("terminal-rejected")).toBeVisible();
  await expect(page.getByTestId("order-badge-rejected")).toBeVisible();
  // No timeline for a rejected order.
  await expect(page.getByTestId("order-timeline")).toHaveCount(0);

  // Give any (incorrect) poll a chance to fire, then assert none did.
  await page.waitForTimeout(2500);
  expect(polled).toBe(false);
});
