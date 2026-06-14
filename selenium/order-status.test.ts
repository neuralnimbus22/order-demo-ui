// Mirror of e2e/order-status.spec.ts (Playwright) / cypress/e2e/order-status.cy.ts.
// Order-status convergence view (/orders/[id]).
//
// The convergence test drives the REAL backend through the BFF and needs the
// five services port-forwarded (same as selenium/checkout.test.ts):
//   kubectl -n order-demo port-forward svc/user-session    3006:3006 &
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//   kubectl -n order-demo port-forward svc/order           3002:3002 &
//   kubectl -n order-demo port-forward svc/payment         3004:3004 &
//   kubectl -n order-demo port-forward svc/inventory       3003:3003 &
//
// The rejected-order test uses a SYNTHETIC localStorage fixture (an order with
// status:"rejected", trackable:false) rather than driving a real backend
// rejection — forcing a genuine rejection would mean breaking a backend service
// mid-test, which is out of scope here.

import assert from "node:assert/strict";
import type { WebDriver } from "selenium-webdriver";
import {
  buildDriver,
  resetState,
  get,
  click,
  loginAsDemo,
  waitVisible,
  waitAttr,
  waitAbsent,
  waitUrl,
  isPresent,
  CONVERGENCE_TIMEOUT,
  KNOWN,
} from "./driver";

describe("order status", () => {
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

  it("convergence timeline reaches order-placed, payment-confirmed, fulfilled", async () => {
    await loginAsDemo(driver);
    await get(driver, `/products/${KNOWN.sku}`);
    await click(driver, "detail-add");
    await get(driver, "/checkout");
    await click(driver, "place-order");
    await waitUrl(driver, (u) => /^\?placed=/.test(u.search));

    await click(driver, "order-row");
    await waitUrl(driver, (u) => /^\/orders\/.+/.test(u.pathname));

    // Both events converge (same id sent to order + payment). Explicit waits up
    // to 20s for each step's data-state to reach "done" (no Selenium auto-wait).
    await waitAttr(driver, "timeline-step-order", "data-state", "done", CONVERGENCE_TIMEOUT);
    await waitAttr(driver, "timeline-step-payment", "data-state", "done", CONVERGENCE_TIMEOUT);
    await waitAttr(driver, "timeline-step-fulfilled", "data-state", "done", CONVERGENCE_TIMEOUT);
    await waitVisible(driver, "terminal-fulfilled");
    await waitVisible(driver, "order-badge-fulfilled");
    // Polling stops once fulfilled.
    await waitAbsent(driver, "order-polling");
  });

  it("a rejected order shows the terminal couldn't-place state and does NOT poll", async () => {
    await loginAsDemo(driver);

    const rejectedId = "rejected-fixture-0001";
    const order = {
      id: rejectedId,
      sku: "BK-001",
      name: "Hardcover Notebook",
      qty: 1,
      amount: 14.99,
      status: "rejected",
      detail: "This item is no longer available.",
      trackable: false,
      placedAt: "2026-06-13T12:00:00.000Z",
      batchId: rejectedId,
    };

    // Seeding order (per the plan): navigate to the order page first so the
    // origin's localStorage is reachable, set the SYNTHETIC fixture, then reload
    // so the app reads it on mount. (Selenium's equivalent of Playwright's
    // addInitScript / Cypress's onBeforeLoad.)
    await get(driver, `/orders/${rejectedId}`);
    await driver.executeScript(
      "window.localStorage.setItem('sundry-orders-v1', arguments[0]);",
      JSON.stringify([order]),
    );
    await driver.navigate().refresh();

    // Initial render (t=0): the terminal rejected state is shown, with no
    // timeline.
    await waitVisible(driver, "terminal-rejected");
    await waitVisible(driver, "order-badge-rejected");
    assert.equal(await isPresent(driver, "order-timeline"), false);

    // NO-POLL assertion — this is the one place the assertion is OUTCOME-BASED
    // rather than network-based (raw Selenium can't cleanly count XHRs). A
    // non-trackable order never polls, so its state can never transition. We
    // prove that by asserting STABILITY: the rejected terminal is present now
    // AND still present after a settle, with no timeline ever appearing. If a
    // poll had fired and returned a converging response, the view would have
    // flipped — so "it didn't flip" is the evidence it didn't poll. The settle
    // is the single deliberate sleep in the suite.
    await driver.sleep(2500);
    assert.equal(
      await isPresent(driver, "terminal-rejected"),
      true,
      "rejected terminal should remain after the settle (no poll-driven flip)",
    );
    assert.equal(
      await isPresent(driver, "order-badge-rejected"),
      true,
      "rejected badge should remain after the settle",
    );
    assert.equal(
      await isPresent(driver, "order-timeline"),
      false,
      "no timeline should ever appear for a non-trackable order",
    );
  });
});
