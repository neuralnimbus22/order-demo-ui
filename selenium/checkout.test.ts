// Mirror of e2e/checkout.spec.ts (Playwright) / cypress/e2e/checkout.cy.ts.
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
// NOTE on the happy-path assertion: Playwright/Cypress assert "/api/checkout
// returned 200" by intercepting the call. Raw Selenium can't intercept XHRs
// cleanly, so this mirrors the equivalent USER-VISIBLE outcome — the
// confirmation + a non-empty order id appears and the cart clears. That's a
// stronger end-to-end signal (the user sees success), just expressed without a
// network hook.

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  loginAsDemo,
  waitVisible,
  waitAbsent,
  waitUrl,
  count,
  text,
  KNOWN,
  CONVERGENCE_TIMEOUT,
} from "./driver";

async function addKnownItem(driver: WebDriver) {
  await get(driver, `/products/${KNOWN.sku}`);
  await click(driver, "detail-add");
  await waitVisible(driver, "cart-badge-count");
}

describe("checkout", () => {
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

  it("logged-out /checkout redirects to /login", async () => {
    await get(driver, "/checkout");
    await waitUrl(driver, (u) => u.pathname === "/login");
    await waitVisible(driver, "login-email");
  });

  it("logged-in /checkout with an empty cart shows the empty state", async () => {
    await loginAsDemo(driver);
    await get(driver, "/checkout");
    await waitVisible(driver, "checkout-empty");
    // No order was placed.
    assert.equal(new URL(await driver.getCurrentUrl()).pathname, "/checkout");
  });

  it("happy path: place an order, confirmation shows the id, cart clears", async () => {
    await loginAsDemo(driver);
    await addKnownItem(driver);

    await get(driver, "/checkout");
    assert.equal(await count(driver, "checkout-line"), 1);

    await click(driver, "place-order");

    // Outcome-based (see file header): the confirmation + a non-empty order id
    // render, and the cart badge is gone.
    await waitUrl(driver, (u) => /^\?placed=/.test(u.search));
    await waitVisible(driver, "checkout-confirmation");
    const orderId = await text(driver, "order-id");
    assert.ok(orderId.trim().length > 0, "order id should be non-empty");

    await waitAbsent(driver, "cart-badge-count");
  });

  it("a placed order is real and trackable toward fulfilled", async () => {
    await loginAsDemo(driver);
    await addKnownItem(driver);
    await get(driver, "/checkout");
    await click(driver, "place-order");
    await waitUrl(driver, (u) => /^\?placed=/.test(u.search));

    // Open the order's status view and confirm it converges. Both order-placed
    // and payment-confirmed were sent for the same id, so inventory fulfills
    // it. (Deep convergence assertions live in order-status.test.ts.)
    await click(driver, "order-row");
    await waitUrl(driver, (u) => /^\/orders\/.+/.test(u.pathname));
    await waitVisible(driver, "order-detail-id");
    // Real backend converges in a few seconds; allow 20s like the PW/Cypress
    // specs (Selenium has no auto-wait — this is an explicit WebDriverWait).
    await waitVisible(driver, "order-badge-fulfilled", CONVERGENCE_TIMEOUT);
  });
});
