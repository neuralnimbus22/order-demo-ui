// Mirror of e2e/auth.spec.ts (Playwright). Auth flows against the REAL
// user-session service through the BFF.
//
// Requires user-session reachable at USER_SESSION_URL (default
// http://localhost:3006 — port-forward it first):
//   kubectl -n order-demo port-forward svc/user-session 3006:3006 &
//
// Seeded demo credentials come from the backend's user-session seed
// (SEED_USER_EMAIL / SEED_USER_PASSWORD, see backend IMPLEMENTATION.md).
const SEEDED_EMAIL = "demo@example.com";
const SEEDED_PASSWORD = "demo-password";

function logIn(email: string, password: string) {
  cy.visit("/login");
  cy.get('[data-testid="login-email"]').type(email);
  cy.get('[data-testid="login-password"]').type(password, { log: false });
  cy.get('[data-testid="login-submit"]').click();
}

describe("auth", () => {
  it("login with the seeded demo user lands on /account, header shows the email", () => {
    logIn(SEEDED_EMAIL, SEEDED_PASSWORD);
    cy.location("pathname").should("eq", "/account");
    cy.get('[data-testid="header-email"]').should("have.text", SEEDED_EMAIL);
    cy.get('[data-testid="account-email"]').should("have.text", SEEDED_EMAIL);
  });

  it("wrong password shows a generic error, sets no cookie, stays on /login", () => {
    logIn(SEEDED_EMAIL, "definitely-not-the-password");
    cy.get('[data-testid="login-error"]').should(
      "have.text",
      "Invalid email or password.",
    );
    cy.location("pathname").should("eq", "/login");
    cy.getCookie("session").should("be.null");
  });

  it("register a fresh account, then log in with it", () => {
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = "e2e-password-123";

    cy.visit("/register");
    cy.get('[data-testid="register-email"]').type(email);
    cy.get('[data-testid="register-password"]').type(password, { log: false });
    cy.get('[data-testid="register-confirm"]').type(password, { log: false });
    cy.get('[data-testid="register-submit"]').click();

    // No auto-login by design: success routes to /login with a notice.
    cy.location("search").should("eq", "?registered=1");
    cy.get('[data-testid="register-success"]').should("be.visible");

    cy.get('[data-testid="login-email"]').type(email);
    cy.get('[data-testid="login-password"]').type(password, { log: false });
    cy.get('[data-testid="login-submit"]').click();
    cy.location("pathname").should("eq", "/account");
    cy.get('[data-testid="header-email"]').should("have.text", email);
  });

  it("registering the seeded email shows the already-exists message", () => {
    cy.visit("/register");
    cy.get('[data-testid="register-email"]').type(SEEDED_EMAIL);
    cy.get('[data-testid="register-password"]').type("whatever-password", { log: false });
    cy.get('[data-testid="register-confirm"]').type("whatever-password", { log: false });
    cy.get('[data-testid="register-submit"]').click();
    cy.get('[data-testid="register-error"]').should(
      "have.text",
      "An account with this email already exists.",
    );
    cy.location("pathname").should("eq", "/register");
  });

  it("logout clears the session and the header returns to logged out", () => {
    logIn(SEEDED_EMAIL, SEEDED_PASSWORD);
    cy.location("pathname").should("eq", "/account");

    cy.get('[data-testid="header-logout"]').click();
    cy.location("pathname").should("eq", "/");
    cy.get('[data-testid="header-login"]').should("be.visible");
    cy.getCookie("session").should("be.null");

    // The protected route agrees the session is gone.
    cy.visit("/account");
    cy.location("pathname").should("eq", "/login");
  });

  it("visiting the protected route logged out redirects to /login", () => {
    cy.visit("/account");
    cy.location("pathname").should("eq", "/login");
    cy.get('[data-testid="login-email"]').should("be.visible");
  });
});
