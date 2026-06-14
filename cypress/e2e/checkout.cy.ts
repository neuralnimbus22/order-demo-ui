// Mirror of e2e/checkout.spec.ts (Playwright). Checkout (the correlation-id
// flow) against the REAL backend through the BFF.
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

function logIn() {
  cy.visit("/login");
  cy.get('[data-testid="login-email"]').type(SEEDED_EMAIL);
  cy.get('[data-testid="login-password"]').type(SEEDED_PASSWORD, { log: false });
  cy.get('[data-testid="login-submit"]').click();
  cy.location("pathname").should("eq", "/account");
}

function addKnownItem() {
  cy.visit(`/products/${KNOWN.sku}`);
  cy.get('[data-testid="detail-add"]').click();
  cy.get('[data-testid="cart-badge-count"]').should("have.text", "1");
}

describe("checkout", () => {
  it("logged-out /checkout redirects to /login", () => {
    cy.visit("/checkout");
    cy.location("pathname").should("eq", "/login");
    cy.get('[data-testid="login-email"]').should("be.visible");
  });

  it("logged-in /checkout with an empty cart shows the empty state", () => {
    logIn();
    cy.visit("/checkout");
    cy.get('[data-testid="checkout-empty"]').should("be.visible");
    // No order was placed.
    cy.location("pathname").should("eq", "/checkout");
  });

  it("happy path: place an order, confirmation shows the id, cart clears", () => {
    logIn();
    addKnownItem();

    cy.visit("/checkout");
    cy.get('[data-testid="checkout-line"]').should("have.length", 1);

    // The BFF route is what the browser calls — order/payment are never hit
    // directly from the page. Spy (passthrough) and assert the 200.
    cy.intercept("POST", "/api/checkout").as("checkout");
    cy.get('[data-testid="place-order"]').click();
    cy.wait("@checkout").its("response.statusCode").should("eq", 200);

    // Lands on the confirmation with the placed order id shown.
    cy.location("search").should("match", /^\?placed=/);
    cy.get('[data-testid="checkout-confirmation"]').should("be.visible");
    cy.get('[data-testid="order-id"]')
      .first()
      .invoke("text")
      .then((t) => expect(t.trim().length).to.be.greaterThan(0));

    // Cart is cleared (badge gone — only rendered when count > 0).
    cy.get('[data-testid="cart-badge-count"]').should("not.exist");
  });

  it("a placed order is real and trackable toward fulfilled", () => {
    logIn();
    addKnownItem();
    cy.visit("/checkout");
    cy.get('[data-testid="place-order"]').click();
    cy.location("search").should("match", /^\?placed=/);

    // Open the order's status view and confirm it converges. Both order-placed
    // and payment-confirmed were sent for the same id, so inventory fulfills
    // it. (Deep convergence assertions live in order-status.cy.ts.)
    cy.get('[data-testid="order-row"]').first().click();
    cy.location("pathname").should("match", /^\/orders\/.+/);
    cy.get('[data-testid="order-detail-id"]').should("be.visible");
    // Real backend converges within ~seconds; allow 20s like the PW spec
    // (Cypress's default 4s would flake here).
    cy.get('[data-testid="order-badge-fulfilled"]', { timeout: 20000 }).should(
      "be.visible",
    );
  });
});
