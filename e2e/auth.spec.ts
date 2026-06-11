import { test, expect } from "@playwright/test";

// Auth flows against the REAL user-session service through the BFF.
//
// Requires user-session reachable at USER_SESSION_URL (default
// http://localhost:3006 — port-forward it first):
//   kubectl -n order-demo port-forward svc/user-session 3006:3006 &
//
// Seeded demo credentials come from the backend's user-session seed
// (SEED_USER_EMAIL / SEED_USER_PASSWORD, see backend IMPLEMENTATION.md).
const SEEDED_EMAIL = "demo@example.com";
const SEEDED_PASSWORD = "demo-password";

async function logIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

test("login with the seeded demo user lands on /account, header shows the email", async ({
  page,
}) => {
  await logIn(page, SEEDED_EMAIL, SEEDED_PASSWORD);
  await page.waitForURL("**/account");
  await expect(page.getByTestId("header-email")).toHaveText(SEEDED_EMAIL);
  await expect(page.getByTestId("account-email")).toHaveText(SEEDED_EMAIL);
});

test("wrong password shows a generic error, sets no cookie, stays on /login", async ({
  page,
  context,
}) => {
  await logIn(page, SEEDED_EMAIL, "definitely-not-the-password");
  await expect(page.getByTestId("login-error")).toHaveText(
    "Invalid email or password.",
  );
  expect(new URL(page.url()).pathname).toBe("/login");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "session")).toBeUndefined();
});

test("register a fresh account, then log in with it", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = "e2e-password-123";

  await page.goto("/register");
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill(password);
  await page.getByTestId("register-confirm").fill(password);
  await page.getByTestId("register-submit").click();

  // No auto-login by design: success routes to /login with a notice.
  await page.waitForURL("**/login?registered=1");
  await expect(page.getByTestId("register-success")).toBeVisible();

  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/account");
  await expect(page.getByTestId("header-email")).toHaveText(email);
});

test("registering the seeded email shows the already-exists message", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByTestId("register-email").fill(SEEDED_EMAIL);
  await page.getByTestId("register-password").fill("whatever-password");
  await page.getByTestId("register-confirm").fill("whatever-password");
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("register-error")).toHaveText(
    "An account with this email already exists.",
  );
  expect(new URL(page.url()).pathname).toBe("/register");
});

test("logout clears the session and the header returns to logged out", async ({
  page,
  context,
}) => {
  await logIn(page, SEEDED_EMAIL, SEEDED_PASSWORD);
  await page.waitForURL("**/account");

  await page.getByTestId("header-logout").click();
  await page.waitForURL((url) => new URL(url).pathname === "/");
  await expect(page.getByTestId("header-login")).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "session")).toBeUndefined();

  // The protected route agrees the session is gone.
  await page.goto("/account");
  await page.waitForURL("**/login");
});

test("visiting the protected route logged out redirects to /login", async ({
  page,
}) => {
  await page.goto("/account");
  await page.waitForURL("**/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
});
