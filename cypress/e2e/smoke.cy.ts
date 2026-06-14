// Mirror of e2e/smoke.spec.ts (Playwright). Scaffold smoke: the app serves and
// its liveness route answers. Neither check needs the backend up —
// /api/health is deliberately liveness-only.
//
// Target comes from E2E_BASE_URL (default http://localhost:3000); the app is
// assumed already running. See README "End-to-end tests".

describe("smoke", () => {
  it("home page renders the brand", () => {
    cy.visit("/");
    cy.get('[data-testid="header-brand"]').should("have.text", "Sundry");
  });

  it("GET /api/health returns ok", () => {
    cy.request("/api/health").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.deep.eq({ status: "ok" });
    });
  });
});
