// Shared Selenium harness — framework #3 on the same E2E target convention.
//
//   The app is assumed ALREADY RUNNING at E2E_BASE_URL (default
//   http://localhost:3000). Selenium never starts it. See README "End-to-end
//   tests". chromedriver is resolved automatically by Selenium Manager (bundled
//   with selenium-webdriver) — no hardcoded driver path.
//
// Raw Selenium has NO auto-waiting, so every visibility/navigation/text/
// attribute assertion goes through an explicit WebDriverWait helper below.
// These wrap the wait logic once so the 19 mirrored tests express intent, not
// polling boilerplate. There are no raw sleeps except the single, named settle
// in the rejected-order no-poll test (which is asserting state *stability*).

import { Builder, By, until, type WebDriver, type WebElement } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const DEFAULT_TIMEOUT = 10_000;
// Matches the PW/Cypress 20s convergence allowance (real backend converges in
// a few seconds; the budget absorbs Kafka + poll latency).
export const CONVERGENCE_TIMEOUT = 20_000;

export const SEEDED = { email: "demo@example.com", password: "demo-password" };
export const KNOWN = { sku: "BK-001", name: "Hardcover Notebook", price: "$14.99" };

export function buildDriver(): Promise<WebDriver> {
  const options = new Options();
  options.addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=1280,900",
  );
  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

const sel = (id: string) => By.css(`[data-testid="${id}"]`);

export function get(driver: WebDriver, path: string): Promise<void> {
  return driver.get(BASE_URL + path);
}

/** Reset per-test state (cookies + storage) so each test is isolated, mirroring
 * Playwright's fresh context and Cypress's test isolation. */
export async function resetState(driver: WebDriver): Promise<void> {
  await get(driver, "/");
  await driver.manage().deleteAllCookies();
  await driver.executeScript(
    "window.localStorage.clear(); window.sessionStorage.clear();",
  );
}

export async function waitVisible(
  driver: WebDriver,
  id: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<WebElement> {
  const el = await driver.wait(until.elementLocated(sel(id)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

/** True iff at least one element with the testid exists right now (no wait). */
export async function isPresent(driver: WebDriver, id: string): Promise<boolean> {
  return (await driver.findElements(sel(id))).length > 0;
}

export async function count(driver: WebDriver, id: string): Promise<number> {
  return (await driver.findElements(sel(id))).length;
}

export async function waitAbsent(
  driver: WebDriver,
  id: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  await driver.wait(
    async () => (await driver.findElements(sel(id))).length === 0,
    timeout,
  );
}

export async function waitCountAtLeast(
  driver: WebDriver,
  id: string,
  n: number,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  await driver.wait(
    async () => (await driver.findElements(sel(id))).length >= n,
    timeout,
  );
}

export async function waitUrl(
  driver: WebDriver,
  predicate: (url: URL) => boolean,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  await driver.wait(async () => {
    try {
      return predicate(new URL(await driver.getCurrentUrl()));
    } catch {
      return false;
    }
  }, timeout);
}

export async function text(driver: WebDriver, id: string): Promise<string> {
  return (await waitVisible(driver, id)).getText();
}

export async function waitText(
  driver: WebDriver,
  id: string,
  expected: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const el = await waitVisible(driver, id, timeout);
  await driver.wait(until.elementTextIs(el, expected), timeout);
}

/** Wait until the first element with the testid has attr === value. Used for
 * the timeline steps' data-state="done". */
export async function waitAttr(
  driver: WebDriver,
  id: string,
  attr: string,
  value: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  await driver.wait(async () => {
    const els = await driver.findElements(sel(id));
    if (els.length === 0) return false;
    return (await els[0].getAttribute(attr)) === value;
  }, timeout);
}

export async function type(
  driver: WebDriver,
  id: string,
  value: string,
): Promise<void> {
  const el = await waitVisible(driver, id);
  await el.clear();
  await el.sendKeys(value);
}

export async function click(driver: WebDriver, id: string): Promise<void> {
  const el = await waitVisible(driver, id);
  await el.click();
}

/** Perform the login form steps. Does NOT assert the outcome — callers decide
 * whether to wait for /account (success) or assert an error (bad password). */
export async function login(
  driver: WebDriver,
  email = SEEDED.email,
  password = SEEDED.password,
): Promise<void> {
  await get(driver, "/login");
  await type(driver, "login-email", email);
  await type(driver, "login-password", password);
  await click(driver, "login-submit");
}

/** Login as the seeded demo user and wait until the protected landing renders. */
export async function loginAsDemo(driver: WebDriver): Promise<void> {
  await login(driver);
  await waitUrl(driver, (u) => u.pathname === "/account");
}

export async function hasSessionCookie(driver: WebDriver): Promise<boolean> {
  const cookies = await driver.manage().getCookies();
  return cookies.some((c) => c.name === "session");
}

/** XPath for an inner element inside the product-card whose product-card-name
 * matches `name` — robust to grid ordering. */
export function inCardByName(name: string, innerTestid: string): By {
  return By.xpath(
    `//*[@data-testid='product-card']` +
      `[.//*[@data-testid='product-card-name'][normalize-space()=${xpathLiteral(name)}]]` +
      `//*[@data-testid='${innerTestid}']`,
  );
}

/** XPath for an inner element inside the cart-line whose cart-line-name matches. */
export function inCartLineByName(name: string, innerTestid: string): By {
  return By.xpath(
    `//*[@data-testid='cart-line']` +
      `[.//*[@data-testid='cart-line-name'][normalize-space()=${xpathLiteral(name)}]]` +
      `//*[@data-testid='${innerTestid}']`,
  );
}

/** Quote a string for XPath (handles names with apostrophes safely). */
function xpathLiteral(s: string): string {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
}

export async function clickBy(driver: WebDriver, by: By, timeout = DEFAULT_TIMEOUT): Promise<void> {
  const el = await driver.wait(until.elementLocated(by), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  await el.click();
}

export async function waitTextBy(
  driver: WebDriver,
  by: By,
  expected: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const el = await driver.wait(until.elementLocated(by), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  await driver.wait(until.elementTextIs(el, expected), timeout);
}
