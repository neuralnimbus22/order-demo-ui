// Mirror of e2e/storefront.spec.ts (Playwright). Storefront + cart against the
// REAL product-catalog through the BFF.
//
// Requires product-catalog reachable at PRODUCT_CATALOG_URL (default
// http://localhost:3005 — port-forward it first):
//   kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
//
// "Hardcover Notebook" (BK-001, $14.99) is part of the catalog's idempotent
// seed, so it's a stable anchor for assertions.
const KNOWN = { sku: "BK-001", name: "Hardcover Notebook", price: "$14.99" };

describe("storefront", () => {
  it("storefront grid renders products from the catalog", () => {
    cy.visit("/");
    cy.get('[data-testid="product-card"]').should("have.length.at.least", 20);
    cy.get('[data-testid="product-card-name"]')
      .contains(KNOWN.name)
      .should("be.visible");
  });

  it("a card links through to the product detail with name and price", () => {
    cy.visit("/");
    cy.contains('[data-testid="product-card"]', KNOWN.name)
      .find('[data-testid="product-card-link"]')
      .click();
    cy.location("pathname").should("eq", `/products/${KNOWN.sku}`);
    cy.get('[data-testid="detail-name"]').should("have.text", KNOWN.name);
    cy.get('[data-testid="detail-price"]').should("have.text", KNOWN.price);
  });

  it("adding to cart updates the header badge and the cart page", () => {
    cy.visit(`/products/${KNOWN.sku}`);
    cy.get('[data-testid="detail-qty-increase"]').click(); // qty -> 2
    cy.get('[data-testid="detail-add"]').click();
    cy.get('[data-testid="cart-badge-count"]').should("have.text", "2");

    cy.visit("/cart");
    cy.get('[data-testid="cart-line"]').should("have.length", 1);
    cy.get('[data-testid="cart-line"]')
      .find('[data-testid="cart-line-name"]')
      .should("have.text", KNOWN.name);
    cy.get('[data-testid="cart-line-qty"]').should("have.text", "2");
    cy.get('[data-testid="cart-subtotal"]').should("have.text", "$29.98");
  });

  it("qty steppers and remove keep the subtotal correct", () => {
    // Two distinct seeded products via the grid's add buttons.
    cy.visit("/");
    cy.contains('[data-testid="product-card"]', KNOWN.name)
      .find('[data-testid="product-card-add"]')
      .click(); // $14.99
    cy.contains('[data-testid="product-card"]', "Gel Pen 5-pack")
      .find('[data-testid="product-card-add"]')
      .click(); // $6.49
    cy.get('[data-testid="cart-badge-count"]').should("have.text", "2");

    cy.visit("/cart");
    cy.get('[data-testid="cart-line"]').should("have.length", 2);
    cy.get('[data-testid="cart-subtotal"]').should("have.text", "$21.48");

    // Bump the notebook to qty 3: 3*14.99 + 6.49 = 51.46
    cy.contains('[data-testid="cart-line"]', KNOWN.name).within(() => {
      cy.get('[data-testid="cart-line-increase"]').click();
      cy.get('[data-testid="cart-line-increase"]').click();
      cy.get('[data-testid="cart-line-qty"]').should("have.text", "3");
    });
    cy.get('[data-testid="cart-subtotal"]').should("have.text", "$51.46");

    // Remove the pens: back to 3*14.99 = 44.97
    cy.contains('[data-testid="cart-line"]', "Gel Pen 5-pack")
      .find('[data-testid="cart-line-remove"]')
      .click();
    cy.get('[data-testid="cart-line"]').should("have.length", 1);
    cy.get('[data-testid="cart-subtotal"]').should("have.text", "$44.97");
  });

  it("the cart survives a reload (localStorage)", () => {
    cy.visit("/");
    cy.contains('[data-testid="product-card"]', KNOWN.name)
      .find('[data-testid="product-card-add"]')
      .click();
    cy.get('[data-testid="cart-badge-count"]').should("have.text", "1");

    cy.reload();
    cy.get('[data-testid="cart-badge-count"]').should("have.text", "1");

    cy.visit("/cart");
    cy.get('[data-testid="cart-line"]')
      .find('[data-testid="cart-line-name"]')
      .should("have.text", KNOWN.name);
  });
});
