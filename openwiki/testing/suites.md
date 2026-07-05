# Testing — suites in detail

Per-suite reference. Shared conventions (E2E target, isolation, honest gates) are in
[overview.md](overview.md); the rules are in [`CLAUDE.md`](../../CLAUDE.md).

## Playwright — functional, a11y, convergence

Config `playwright.config.ts`: `testDir: ./e2e`, `fullyParallel`, **no `webServer`**
block, `baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"`, CI retries = 2.
Specs: `smoke`, `storefront`, `auth`, `checkout`, `account-badge`, `a11y`, `convergence`.
Three projects, each an npm script:

- **`chromium`** (`npm run test:e2e`) — `testIgnore` a11y + convergence, so it runs just
  the fast functional flows.
- **`a11y`** (`npm run test:a11y`, `e2e/a11y.spec.ts`) — WCAG A/AA via
  `@axe-core/playwright` (tags `wcag2a/2aa/21a/21aa`). Audits `/`, `/products/BK-001`,
  `/login`, `/register`, `/cart`, `/checkout` (authed), `/orders/[id]` (authed, synthetic
  `sundry-orders-v1` fixture). **Gate:** fails only on `serious`+`critical` impacts
  (`GATED_IMPACTS`); moderate/minor are info. It *adds the audit*, it does not fix
  findings.
- **`convergence`** (`npm run test:e2e:convergence`, `e2e/convergence.spec.ts`) — drives
  the real Kafka convergence (order-placed → payment-confirmed → fulfilled), 60s step
  timeouts / 150s per test. Includes a rejected-order test using a synthetic localStorage
  fixture that asserts a non-trackable order does **not** poll (intercepts
  `**/api/orders/*/status`).

Gate: Playwright exit code.

## Cypress — functional mirror

`cypress.config.ts`: `baseUrl = E2E_BASE_URL ?? localhost:3000`, `specPattern
cypress/e2e/**/*.cy.ts`, `supportFile:false`, `defaultCommandTimeout:6000`,
`retries {runMode:2}`; verifies `baseUrl` is reachable at startup (enforces "already
running"). Specs: `smoke`, `auth`, `checkout`, `order-status`, `storefront`. Own
`cypress/tsconfig.json`. `npm run test:cypress` (headless) / `cypress:open`. Gate:
Cypress exit code.

## Selenium — functional mirror

Shared harness `selenium/driver.ts`: `BASE_URL = E2E_BASE_URL ?? localhost:3000`,
headless Chrome via **Selenium Manager** (no hardcoded chromedriver; `CHROME_BIN`
overrides the binary), explicit `WebDriverWait` helpers (raw Selenium has no auto-wait),
seeded creds `demo@example.com`/`demo-password`. Config `selenium/.mocharc.json`
(`node-option import=tsx`, 60s timeout). Test files: `smoke`, `auth`, `checkout`,
`order-status`, `storefront`. Scripts: `test:selenium`, plus `:convergence` /
`:parallel-safe` (mocha `--grep`). Gate: Mocha exit code.

## BDD — Cucumber + Selenium (Java/Maven)

`bdd/` is a self-contained Maven module (`bdd/pom.xml`: Cucumber 7.20.1, JUnit 5.11.4,
Selenium 4.27.0, Surefire 3.5.2, Java 17). Runner `RunCucumberTest.java`
(`@Suite @IncludeEngines("cucumber") @SelectClasspathResource("features")`); glue in
`steps/` + `support/`. Base-URL resolution (`config/Config.java`): `-Dui.base.url` →
`E2E_BASE_URL` → in-cluster default `http://order-demo-ui.order-demo.svc.cluster.local:3000`.
Feature files under `bdd/src/test/resources/features/`:

- `login.feature` (`@ui @session`) — browser login lands on `/account`, header shows
  `demo@example.com`.
- `storefront.feature` (`@ui @smoke`) — home shows brand "Sundry" + ≥20 products;
  `BK-001` detail shows "Hardcover Notebook" / "$14.99".

Run `cd bdd && mvn test` (tag filter `-Dcucumber.filter.tags="@ui"`); reports in
`bdd/target/surefire-reports/` + `cucumber-report.html`. Gate: Surefire exit code.

## JMeter — load

`jmeter/order-demo-load.jmx` + `jmeter/run.sh` (`npm run test:load`). Parses
`E2E_BASE_URL` into `-Jscheme/-Jhost/-Jport`. Loads `GET /api/products` +
`GET /api/health`; `POST /api/auth/login` is an opt-in thread group (`--include-auth`,
off by default). `POST /api/checkout` is **never** loaded — it would place real orders.
Profile: `THREADS=20 RAMPUP=10 DURATION=30 MAXMS=1500`. **Gate:** JMeter's CLI exits 0
even on assertion failure, so `run.sh` parses the `.jtl` `success` column and exits
non-zero on any failed sample or zero samples; a missing `jmeter` binary exits 2.
Optional InfluxDB live streaming (`--influx`) is additive/off by default — see
[operations.md → Observability](../operations.md#observability-live-load-dashboard).

## Gatling — load (Scala DSL)

`gatling/` (`pom.xml` pins Gatling 3.13.5, gatling-maven-plugin 4.16.3,
scala-maven-plugin 4.9.2, Java 17), simulation
`src/test/scala/orderdemo/OrderDemoUiLoadSimulation.scala`, `run.sh`
(`npm run test:load:gatling`). Same endpoints and posture as JMeter (`GET /api/products`
+ `GET /api/health`; login opt-in; checkout never loaded), matched defaults
(`USERS=20 RAMP=10 DURATION=30 MAXMS=1500`). **Gate is native:** `mvn gatling:test` exits
non-zero when a Gatling assertion (zero failures + p95 < `MAXMS`) breaches — no `.jtl`
wrapper; missing `mvn` exits 2. Batch HTML report only. The contrast with JMeter is *how
it's authored*: Scala code vs XML.

## Newman — BFF API contract

`newman/order-demo-bff.postman_collection.json` + `run.sh` (`npm run test:bff-contract`),
pinned container `postman/newman:6.1.3-alpine`. This tests the **BFF `/api/*` layer**
(status + response **schema**), distinct from the backend repo's service-level tests.
Target from `E2E_BASE_URL`; a `localhost` target is rewritten to `host.docker.internal`
(+`--add-host host-gateway`), a real hostname passes through untouched. Covers health,
products (known/unknown), the auth flow (login good/bad/missing → capture the `session`
cookie → `/api/auth/me` with/without it; register fresh/dup; logout), and the cookie-gated
`/api/orders/:id/status`. **Checkout: guards only** — logged-out → 401, empty-cart → 400;
no real order placed. Gate: native Newman exit code.

## Semgrep — SAST (source-time)

`semgrep/run.sh` (`npm run test:sast`), pinned container `semgrep/semgrep:1.97.0`. Does
**not** run the app. Scans `app/ lib/ components/` (test suites, `node_modules`, `.next`,
`public`, `k8s` excluded) with rulesets `p/typescript p/javascript p/react p/nextjs
p/security-audit p/secrets`. **Gate:** exits non-zero only on `ERROR` severity
(`GATED_SEVERITY`); WARNING/INFO reported, not gated. A non-completing scan (bad config /
no registry network / fatal `errors[]`) exits 2 — never silently green.

## Trivy — image scan (artifact-time)

`trivy/run.sh` (`npm run test:trivy`), pinned container `aquasec/trivy:0.58.1`. Default
builds the image from the repo Dockerfile, `docker save`s it, and scans the tar offline
via `--input`; `TRIVY_IMAGE=<ref>` scans a published image instead. Scanners
`vuln,secret`. **Gate:** fails only on **fixable** HIGH/CRITICAL (`GATED_SEVERITIES` +
`GATE_FIXABLE_ONLY=1`); everything else (incl. unfixed HIGH/CRITICAL marked `NO FIX`) is
reported, not gated — failing on un-actionable CVEs just trains people to ignore the gate.
A non-completing scan exits 2. Semgrep (source) + Trivy (artifact) together are the full
security story; both **surface, they do not fix** (see [`CLAUDE.md`](../../CLAUDE.md)).
