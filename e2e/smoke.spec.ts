import { test, expect } from "@playwright/test";

// Scaffold smoke: the app serves, and its liveness route answers. Neither
// check needs the backend up — /api/health is deliberately liveness-only.

test("home page renders the brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("brand")).toHaveText("Sundry");
});

test("GET /api/health returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
