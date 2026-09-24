# Stagehand journeys

Storefront journeys written in plain English and run by [Stagehand](https://docs.stagehand.dev)
4.1. Stagehand drives a real Chrome and asks a model what to click or type at each step, so a
journey describes what a shopper does, not which element to target.

| File | What it holds |
|---|---|
| `journeys.mjs` | The journeys. Each one is a list of steps and a check at the end. |
| `run.mjs` | Runs every journey in its own fresh browser and writes the results. |
| `browser.mjs` | Starts Chrome with the Stagehand runtime extension loaded. |

## What a run produces

All output goes to `results/`:

- `junit.xml`: one test case per journey. Testkube reads it for the Tests tab.
- `NN-<journey>.png`: a screenshot of the page where each journey ended, pass or fail.
- `results.json`: each step, what Stagehand did for it, the values the check read, and the
  model tokens used.

The run exits `0` when every journey passes, `1` when any journey fails, and `2` when it
cannot start (no API key).

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | The storefront. Same variable as every other suite in this repo. |
| `LLM_API_KEY` | none | API key for the model provider. |
| `STAGEHAND_MODEL` | `anthropic/claude-sonnet-5` | Model, as `provider/model`. |
| `CHROME_PATH` | Chromium in the Playwright image | Chrome binary to launch. |
| `SHOPPER_EMAIL`, `SHOPPER_PASSWORD` | the seeded demo login | Account for the signed-in journey. |

## In Testkube

Workflow: [`testkube/workflows/stagehand-journeys.yaml`](../testkube/workflows/stagehand-journeys.yaml).
It runs in the `mcr.microsoft.com/playwright` image, next to the storefront in the cluster, and
reads the API key from the Testkube credential `stagehand-llm-api-key`.

## Why `browser.mjs` exists

Stagehand 4 runs its page logic inside a Chrome extension. `localBrowser.launch()` installs that
extension with the DevTools command `Extensions.loadUnpacked`, which the Chromium build in the
Playwright image does not offer. `browser.mjs` starts Chrome with `--load-extension` instead and
connects Stagehand to it with `localBrowser.connect()`. That works on any Chromium build. Branded
Google Chrome ignores `--load-extension`, so point `CHROME_PATH` at Chromium or Chrome for Testing
when running outside the image.

## Run locally

```bash
cd stagehand
npm ci
E2E_BASE_URL=http://localhost:3000 LLM_API_KEY=... CHROME_PATH=/path/to/chromium node run.mjs
```
