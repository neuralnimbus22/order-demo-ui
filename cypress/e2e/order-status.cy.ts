// Mirror of e2e/order-status.spec.ts (Playwright). Order-status convergence
// view (/orders/[id]).
//
// The convergence test drives the REAL backend through the BFF and needs the
// five services port-forwarded (same as cypress/e2e/checkout.cy.ts):
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

function logIn() {
  cy.visit("/login");
  cy.get('[data-testid="login-email"]').type(SEEDED_EMAIL);
  cy.get('[data-testid="login-password"]').type(SEEDED_PASSWORD, { log: false });
  cy.get('[data-testid="login-submit"]').click();
  cy.location("pathname").should("eq", "/account");
}

describe("order status", () => {
  it("convergence timeline reaches order-placed, payment-confirmed, fulfilled", () => {
    logIn();
    cy.visit(`/products/${KNOWN.sku}`);
    cy.get('[data-testid="detail-add"]').click();
    cy.visit("/checkout");
    cy.get('[data-testid="place-order"]').click();
    cy.location("search").should("match", /^\?placed=/);

    cy.get('[data-testid="order-row"]').first().click();
    cy.location("pathname").should("match", /^\/orders\/.+/);

    // Both events converge (same id sent to order + payment), so the first two
    // steps reach "done" and the order reaches a terminal fulfilled state.
    // Allow 20s like the PW spec — Cypress's 4s default would flake here.
    cy.get('[data-testid="timeline-step-order"]', { timeout: 20000 }).should(
      "have.attr",
      "data-state",
      "done",
    );
    cy.get('[data-testid="timeline-step-payment"]', { timeout: 20000 }).should(
      "have.attr",
      "data-state",
      "done",
    );
    cy.get('[data-testid="timeline-step-fulfilled"]', { timeout: 20000 }).should(
      "have.attr",
      "data-state",
      "done",
    );
    cy.get('[data-testid="terminal-fulfilled"]').should("be.visible");
    cy.get('[data-testid="order-badge-fulfilled"]').should("be.visible");
    // Polling stops once fulfilled.
    cy.get('[data-testid="order-polling"]').should("not.exist");
  });

  it("a rejected order shows the terminal couldn't-place state and does NOT poll", () => {
    logIn();

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

    // Spy on the status poll so we can assert it never fires for a
    // non-trackable order.
    cy.intercept("GET", "/api/orders/*/status").as("statusPoll");

    // Seed the synthetic fixture before any app script runs, so /orders/[id]
    // reads it straight from localStorage (Cypress's onBeforeLoad runs before
    // the page's scripts — the equivalent of Playwright's addInitScript).
    cy.visit(`/orders/${rejectedId}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem("sundry-orders-v1", JSON.stringify([order]));
      },
    });

    cy.get('[data-testid="terminal-rejected"]').should("be.visible");
    cy.get('[data-testid="order-badge-rejected"]').should("be.visible");
    // No timeline for a rejected order.
    cy.get('[data-testid="order-timeline"]').should("not.exist");

    // Give any (incorrect) poll a chance to fire, then assert none did.
    cy.wait(2500);
    cy.get("@statusPoll.all").should("have.length", 0);
  });
});
