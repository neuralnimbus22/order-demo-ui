// Runs the journeys in journeys.mjs with Stagehand and writes the results the
// way Testkube reads them:
//   results/junit.xml      one test case per journey
//   results/NN-<name>.png  the page where each journey ended
//   results/results.json   each step, what Stagehand did, the values it read,
//                          and the model tokens it used
//
// Environment:
//   E2E_BASE_URL     the storefront (default http://localhost:3000), the same
//                    variable every other suite in this repo reads
//   LLM_API_KEY      API key for the model provider
//   STAGEHAND_MODEL  provider/model (default anthropic/claude-sonnet-5)
//   CHROME_PATH      optional; defaults to the Chromium in the Playwright image
//
// Exit code: 0 when every journey passes, 1 when any journey fails, 2 when the
// run cannot start.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Stagehand } from "@browserbasehq/stagehand";
import { startBrowser } from "./browser.mjs";
import { journeys } from "./journeys.mjs";

const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const MODEL = process.env.STAGEHAND_MODEL || "anthropic/claude-sonnet-5";
const API_KEY = process.env.LLM_API_KEY || "";
const STEP_TIMEOUT_MS = 60_000;
const JOURNEY_TIMEOUT_MS = 240_000;
const RESULTS_DIR = new URL("./results/", import.meta.url);

if (!API_KEY) {
  console.error("LLM_API_KEY is empty. In Testkube it comes from the credential stagehand-llm-api-key.");
  process.exit(2);
}

// Stagehand can reject in the background after a journey has already failed
// and its browser is gone. Log it instead of crashing the whole run.
process.on("unhandledRejection", (reason) => {
  console.log(`  (background error after the journey ended: ${firstLine(reason)})`);
});

rmSync(RESULTS_DIR, { recursive: true, force: true });
mkdirSync(RESULTS_DIR, { recursive: true });

console.log(`Storefront: ${BASE_URL}`);
console.log(`Model:      ${MODEL}`);

const results = [];
for (const [index, journey] of journeys.entries()) {
  results.push(await runJourney(journey, index + 1));
}
writeReports(results);
printSummary(results);
process.exit(results.some((r) => r.status === "failed") ? 1 : 0);

// One journey, in its own fresh browser, so no journey depends on another.
async function runJourney(journey, number) {
  const result = {
    number,
    name: journey.name,
    status: "passed",
    seconds: 0,
    steps: [],
    check: null,
    error: null,
    screenshot: null,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  const started = Date.now();
  console.log(`\nJourney ${number}: ${journey.name}`);

  let session;
  let stagehand;
  let page;
  try {
    session = await startBrowser();
    stagehand = await Stagehand.create({
      browser: session.browser,
      model: { modelName: MODEL, apiKey: API_KEY },
      logging: { level: "warn", format: "pretty" },
    });
    [page] = await session.browser.context.pages();
    await withTimeout(
      walk(journey, stagehand, page, result),
      JOURNEY_TIMEOUT_MS,
      `The journey did not finish within ${JOURNEY_TIMEOUT_MS / 1000}s`,
    );
  } catch (error) {
    result.status = "failed";
    result.error = messageOf(error);
    // The model is called from inside the browser; this is the browser's
    // wording for "the request never reached the model API".
    if (result.error === "Failed to fetch") {
      result.error = "The browser could not reach the model API (Failed to fetch).";
    }
    console.log(`  FAIL  ${result.error}`);
  } finally {
    if (page) {
      const file = `${String(number).padStart(2, "0")}-${slug(journey.name)}.png`;
      try {
        writeFileSync(new URL(file, RESULTS_DIR), await page.screenshot({ fullPage: true }));
        result.screenshot = file;
      } catch (error) {
        console.log(`  (no screenshot: ${firstLine(error)})`);
      }
    }
    await stagehand?.close().catch(() => {});
    session?.stop();
    result.seconds = secondsSince(started);
  }
  return result;
}

async function walk(journey, stagehand, page, result) {
  for (const step of journey.steps) {
    const started = Date.now();

    if (typeof step === "object" && step.goto) {
      await page.goto(BASE_URL + step.goto);
      result.steps.push({ step: `open ${step.goto}`, did: `opened ${step.goto}`, seconds: secondsSince(started) });
      console.log(`  ok    open ${step.goto}`);
      continue;
    }

    // Stagehand rejects a variables key that is present but undefined, so only
    // pass it for journeys that have variables.
    const options = { timeout: STEP_TIMEOUT_MS };
    if (journey.variables) options.variables = journey.variables;
    const act = await stagehand.act(step, options);
    addUsage(result.usage, act.metadata?.usage);
    const did = act.data.actionDescription || act.data.message;
    result.steps.push({ step, did, success: act.data.success, seconds: secondsSince(started) });
    if (!act.data.success) {
      throw new Error(`Step "${step}" did not complete: ${act.data.message}`);
    }
    console.log(`  ok    ${step} -> ${did} (${secondsSince(started)}s)`);
  }

  const { read, schema, pass, describe } = journey.check;
  const started = Date.now();
  const extract = await stagehand.extract(read, schema);
  addUsage(result.usage, extract.metadata?.usage);
  const value = extract.data;
  const passed = Boolean(pass(value));
  result.check = { read, value, passed, summary: describe(value), seconds: secondsSince(started) };
  if (!passed) {
    throw new Error(`Check failed: ${describe(value)}`);
  }
  console.log(`  ok    check: ${describe(value)} (${secondsSince(started)}s)`);
}

function writeReports(results) {
  const failures = results.filter((r) => r.status === "failed").length;
  const seconds = Math.round(results.reduce((sum, r) => sum + r.seconds, 0) * 10) / 10;

  const cases = results.map((r) => {
    const log = [
      ...r.steps.map((s) => `${s.step} -> ${s.did ?? ""}`),
      r.check ? `check: ${r.check.summary}` : "",
      r.screenshot ? `screenshot: ${r.screenshot}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const failure =
      r.status === "failed"
        ? `\n      <failure message="${xml(firstLine(r.error))}">${xml(r.error)}</failure>`
        : "";
    return [
      `    <testcase classname="storefront.journeys" name="${xml(r.name)}" time="${r.seconds}">${failure}`,
      `      <system-out>${xml(log)}</system-out>`,
      `    </testcase>`,
    ].join("\n");
  });

  const junit = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="stagehand-journeys" tests="${results.length}" failures="${failures}" time="${seconds}">`,
    `  <testsuite name="Storefront journeys (Stagehand)" tests="${results.length}" failures="${failures}" errors="0" skipped="0" time="${seconds}" timestamp="${new Date().toISOString()}">`,
    ...cases,
    `  </testsuite>`,
    `</testsuites>`,
    ``,
  ].join("\n");

  writeFileSync(new URL("junit.xml", RESULTS_DIR), junit);
  writeFileSync(
    new URL("results.json", RESULTS_DIR),
    `${JSON.stringify({ baseUrl: BASE_URL, model: MODEL, journeys: results }, null, 2)}\n`,
  );
}

function printSummary(results) {
  const passed = results.filter((r) => r.status === "passed").length;
  const tokensIn = results.reduce((sum, r) => sum + r.usage.inputTokens, 0);
  const tokensOut = results.reduce((sum, r) => sum + r.usage.outputTokens, 0);
  console.log("\nSummary");
  for (const r of results) {
    console.log(`  ${r.status === "passed" ? "PASS" : "FAIL"}  ${r.name} (${r.seconds}s)`);
  }
  console.log(`\n${passed} of ${results.length} journeys passed. Model tokens: ${tokensIn} in, ${tokensOut} out.`);
}

function withTimeout(promise, ms, message) {
  promise.catch(() => {}); // if the timeout wins, the late rejection must not crash the run
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function addUsage(total, usage) {
  total.inputTokens += usage?.inputTokens ?? 0;
  total.outputTokens += usage?.outputTokens ?? 0;
}

function secondsSince(start) {
  return Math.round((Date.now() - start) / 100) / 10;
}

// Error messages can be multi-line JSON (validation errors). Keep them on one
// readable line in the log and the report.
function messageOf(error) {
  const text = String(error?.message ?? error).replace(/\s+/g, " ").trim();
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

function firstLine(error) {
  return messageOf(error).split("\n")[0];
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function xml(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}
