import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility (WCAG) audit via axe-core — a different test TYPE from the
// functional/load suites. Runs through the existing Playwright setup and reads
// the same E2E_BASE_URL; the app is assumed ALREADY RUNNING. Isolated in its own
// Playwright project (see playwright.config.ts) so it never mixes into the
// functional run — `npm run test:a11y`.
//
// Public pages (storefront/detail/login/register/cart) are audited
// unauthenticated. Protected pages (checkout, order status) are audited after a
// login step. The backend-touching pages need the five services reachable
// (same port-forwards as the functional specs) since the detail page renders
// catalog data and login hits user-session.

const SEEDED_EMAIL = "demo@example.com";
const SEEDED_PASSWORD = "demo-password";
const KNOWN_SKU = "BK-001";

// SEVERITY GATE — fail ONLY on these axe impact levels. moderate/minor are
// printed as info but do not fail the test (a demo suite shouldn't red-fail on
// every minor contrast nit). Tighten by adding "moderate"/"minor" here.
const GATED_IMPACTS = ["serious", "critical"];

// WCAG A/AA baseline (WCAG 2.0 + 2.1, levels A and AA) — the standard legal
// scan set, without the broader best-practice/experimental noise.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(SEEDED_EMAIL);
  await page.getByTestId("login-password").fill(SEEDED_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/account");
}

interface ViolationSummary {
  id: string;
  impact: string;
  nodes: number;
  help: string;
}

/** Run axe on the current page, log a per-page breakdown, and return the
 * gated (serious/critical) violations. */
async function audit(page: Page, label: string): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const summarize = (v: (typeof results.violations)[number]): ViolationSummary => ({
    id: v.id,
    impact: v.impact ?? "unknown",
    nodes: v.nodes.length,
    help: v.help,
  });
  const all = results.violations.map(summarize);
  const gated = all.filter((v) => GATED_IMPACTS.includes(v.impact));
  const ungated = all.filter((v) => !GATED_IMPACTS.includes(v.impact));

  // Per-page, legible output: which page, how many, which rules + impacts.
  const line = (v: ViolationSummary) => `      [${v.impact}] ${v.id} (${v.nodes}) — ${v.help}`;
  console.log(`\n  a11y · ${label}`);
  console.log(`    gated (serious+critical): ${gated.length}`);
  gated.forEach((v) => console.log(line(v)));
  console.log(`    info (moderate/minor, not gated): ${ungated.length}`);
  ungated.forEach((v) => console.log(line(v)));

  return gated;
}

test.describe("accessibility (axe / WCAG A+AA)", () => {
  test("/ (storefront)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    const gated = await audit(page, "/ (storefront)");
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/products/[id] (product detail)", async ({ page }) => {
    await page.goto(`/products/${KNOWN_SKU}`);
    await expect(page.getByTestId("detail-name")).toBeVisible();
    const gated = await audit(page, `/products/${KNOWN_SKU}`);
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-email")).toBeVisible();
    const gated = await audit(page, "/login");
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/register", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("register-email")).toBeVisible();
    const gated = await audit(page, "/register");
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/cart (populated)", async ({ page }) => {
    // Add an item so the cart renders line items, not the empty state.
    await page.goto(`/products/${KNOWN_SKU}`);
    await page.getByTestId("detail-add").click();
    await expect(page.getByTestId("cart-badge-count")).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line").first()).toBeVisible();
    const gated = await audit(page, "/cart (populated)");
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/checkout (populated, authed)", async ({ page }) => {
    await logIn(page);
    // Populate the cart so checkout renders the full review, not the empty state.
    await page.goto(`/products/${KNOWN_SKU}`);
    await page.getByTestId("detail-add").click();
    await page.goto("/checkout");
    await expect(page.getByTestId("place-order")).toBeVisible();
    const gated = await audit(page, "/checkout (populated)");
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });

  test("/orders/[id] (order status, authed)", async ({ page }) => {
    await logIn(page);
    // SYNTHETIC fixture: seed a placed order in localStorage so the status page
    // renders deterministically (same pattern as order-status.spec.ts). An
    // accessibility audit checks the page's markup, not live backend convergence
    // — so a seeded order is the right, flake-free way to render the DOM axe scans.
    const orderId = "a11y-fixture-0001";
    await page.addInitScript(
      ([id]) => {
        const order = {
          id,
          sku: "BK-001",
          name: "Hardcover Notebook",
          qty: 1,
          amount: 14.99,
          status: "placed",
          trackable: true,
          placedAt: "2026-06-15T12:00:00.000Z",
          batchId: id,
        };
        window.localStorage.setItem("sundry-orders-v1", JSON.stringify([order]));
      },
      [orderId],
    );
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId("order-detail-id")).toBeVisible();
    const gated = await audit(page, `/orders/${orderId}`);
    expect(gated, JSON.stringify(gated, null, 2)).toEqual([]);
  });
});
