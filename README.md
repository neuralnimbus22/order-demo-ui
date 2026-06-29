# order-demo-ui

The web UI for the [`order-demo-enterprise`](https://github.com/neuralnimbus22/order-demo-enterprise)
backend — a modern e-commerce storefront (product grid, cart, real login, checkout,
order status) that drives the six-service backend's event-driven fulfillment through a
browser, so the same business flows the backend's API tests cover can also be exercised
with Playwright.

**`CLAUDE.md` is the contract** — architecture, backend endpoints, the correlation-id
checkout mechanic, conventions. Read it first.

## Architecture in one paragraph

Backend-for-Frontend: the browser talks only to this Next.js app; route handlers under
`app/api/**` make all backend calls server-side through one typed client
(`lib/backend.ts`) whose base URLs come from env vars. The session JWT (from the
backend's `user-session` service) lives in an httpOnly cookie and never reaches the
browser's JS or the backend's order pipeline.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Playwright

## Getting started (local dev)

The backend runs in Kubernetes (namespace `order-demo`). Port-forward the five services
the UI uses, then point the env vars at localhost:

```bash
kubectl -n order-demo port-forward svc/order           3002:3002 &
kubectl -n order-demo port-forward svc/payment         3004:3004 &
kubectl -n order-demo port-forward svc/inventory       3003:3003 &
kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
kubectl -n order-demo port-forward svc/user-session    3006:3006 &

cp .env.example .env.local   # localhost defaults match the port-forwards above
npm install
npm run dev                  # http://localhost:3000
```

Demo login (seeded by the backend's user-session service): `demo@example.com` /
`demo-password`.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm run build` | production build (standalone output) |
| `npm run start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright tests (`e2e/`) against an **already-running** app at `E2E_BASE_URL` (default `http://localhost:3000`) — see [End-to-end tests](#end-to-end-tests) |

## Layout

| path | contents |
|---|---|
| `app/` | App Router pages: `/` storefront grid, `/products/[id]` detail, `/cart`, `/checkout` (placeholder), `/login`, `/register`, `/account` |
| `app/api/**` | the BFF — the only code that talks to backend services |
| `app/api/auth/*` | `login` (sets the httpOnly session cookie), `register`, `logout`, `me` (validates the cookie against user-session — clears it when stale) |
| `app/api/products*` | catalog list + single product (404 passes through) |
| `lib/backend.ts` | typed backend client; reads `*_URL` env vars, never hardcodes URLs |
| `lib/cart.tsx` | CartProvider — frontend-only cart, persisted to localStorage |
| `lib/session.ts` / `lib/auth.ts` | cookie name + flags · `getSession()`/`requireSession()` server guards |
| `components/` | header (auth-aware, cart badge), storefront grid, product art tiles, auth forms |
| `e2e/` | Playwright specs (`playwright.config.ts` at the root) |
| `.env.example` | the full env-var list with local-dev defaults |

## End-to-end tests

Every E2E suite (Playwright, Cypress, Selenium — and later TestKube) follows
one rule: **the app is already running at `E2E_BASE_URL`; the test harness never
starts it.** A single shared env var picks the target — default
`http://localhost:3000` when unset. There is no self-spawned dev server.

**Mode A — local.** Start the app and the backend it calls, then run the suite
in a second terminal:

```bash
# terminal 1 — backend port-forwards + the app
kubectl -n order-demo port-forward svc/order           3002:3002 &
kubectl -n order-demo port-forward svc/payment         3004:3004 &
kubectl -n order-demo port-forward svc/inventory       3003:3003 &
kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
kubectl -n order-demo port-forward svc/user-session    3006:3006 &
npm run dev                       # serves http://localhost:3000

# terminal 2 — run the suite (E2E_BASE_URL defaults to localhost:3000)
npm run test:e2e
```

The backend-touching specs (auth, storefront, checkout, order-status) need the
five services reachable — see each spec header. The smoke spec is backend-free.

**Mode B — against a deployed UI.** Point `E2E_BASE_URL` at the running target
(e.g. a port-forward of the deployed `order-demo-ui`, or its in-cluster URL
when run from TestKube):

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e     # deployed UI port-forwarded here
```

If the app is not running at `E2E_BASE_URL`, the suite fails to connect — it
will not silently start one.

### Frameworks

The same user journeys are covered in more than one framework (to mirror how
TestKube runs any tool against the deployed app). Every framework reads the
same `E2E_BASE_URL` and assumes the app is already running.

| framework | command | specs |
|---|---|---|
| Playwright | `npm run test:e2e` | `e2e/*.spec.ts` |
| Cypress | `npm run test:cypress` (headless) · `npm run cypress:open` (interactive) | `cypress/e2e/*.cy.ts` |
| Selenium | `npm run test:selenium` (headless Chrome) | `selenium/*.test.ts` |

The Cypress and Selenium suites are 1:1 mirrors of the Playwright coverage —
**the same 19 flows** (smoke 2, auth 6, storefront 5, checkout 4, order-status 2),
same `data-testid`s, same seeded demo login. Each reads the same `E2E_BASE_URL`
and runs identically against either run mode above:

```bash
npm run test:cypress                                       # default localhost:3000
E2E_BASE_URL=http://localhost:3000 npm run test:cypress    # deployed UI port-forwarded here

npm run test:selenium                                      # default localhost:3000
E2E_BASE_URL=http://localhost:3000 npm run test:selenium   # deployed UI port-forwarded here
```

Each framework is isolated from the Next build: Cypress under its own
`cypress/tsconfig.json`, Selenium under `selenium/tsconfig.json` + a scoped
`selenium/.mocharc.json` — both excluded from the Next `tsconfig`/ESLint scope,
so their specs never enter `npm run build` or `npm run lint`.

**Selenium runtime:** `selenium-webdriver` (Node/TS, run by Mocha via `tsx`) drives
headless Chrome. The chromedriver is resolved automatically by **Selenium Manager**
(bundled with selenium-webdriver) — no driver path to install, so it runs the same
in CI/TestKube as locally; it does need a Chrome/Chromium browser present.

### Load testing (JMeter)

A different test *type* from the functional suites: concurrent HTTP **load**
against the BFF API routes, to show the app holds under traffic. Full details in
[`jmeter/README.md`](jmeter/README.md).

```bash
npm run test:load                                        # default: 20 threads, 30s
THREADS=50 DURATION=60 npm run test:load                 # override the profile
E2E_BASE_URL=https://shop.example.com npm run test:load  # against a deployed UI
```

- **What it loads:** the BFF entry points (not the backend directly) —
  `GET /api/products` (fans out to product-catalog through the BFF) and
  `GET /api/health` (cheap baseline). `POST /api/auth/login` is an **opt-in**
  group (`bash jmeter/run.sh --include-auth`, off by default); `POST /api/checkout`
  is intentionally **not** loaded — it places real orders and would pollute the
  system the other suites run against.
- **Targeting:** same `E2E_BASE_URL` convention — `jmeter/run.sh` parses it into
  the `scheme/host/port` JMeter needs; the app is assumed already running.
- **Pass/fail:** each request has Response-Code-200 + Duration(`MAXMS`, default
  1500ms) assertions. JMeter's CLI exits 0 even on assertion failures, so
  `run.sh` inspects the `.jtl` and **exits non-zero if any sample failed** — so
  it can gate a pipeline.
- **Prereqs:** Java + Apache JMeter on `PATH` (`brew install jmeter`); the binary
  is not vendored. `jmeter/` is XML + shell + markdown, so it never affects
  `npm run build`/`lint`.
- **Live dashboard (optional):** `bash jmeter/run.sh --influx` streams metrics to
  InfluxDB 1.x for a provisioned Grafana dashboard you watch in real time — see
  [`k8s/observability/`](k8s/observability/README.md). Streaming is additive and
  off by default; the `.jtl` gate above is unchanged when it's off.

### Load testing (Gatling)

The **second load tool** — the same load, authored as **Scala code** instead of
JMeter's XML (the vivid "any tool, however written" contrast). Same endpoints,
comparable profile, same posture, so the two are a fair side-by-side. Batch only
(native HTML report); no live streaming. Full details in
[`gatling/README.md`](gatling/README.md).

```bash
npm run test:load:gatling                                        # default: 20 users, 30s
USERS=50 DURATION=60 npm run test:load:gatling                   # override the profile
E2E_BASE_URL=https://shop.example.com npm run test:load:gatling  # against a deployed UI
```

- **What it loads:** the same BFF entry points as JMeter — `GET /api/products`
  (fan-out) and `GET /api/health` (baseline). `POST /api/auth/login` is opt-in
  (`bash gatling/run.sh --include-auth`, off by default); `POST /api/checkout` is
  **not** loaded (real orders). Profile defaults match JMeter
  (`USERS=20 RAMP=10 DURATION=30 MAXMS=1500`).
- **Targeting:** same `E2E_BASE_URL` convention (Gatling takes the base URL
  directly); the app is assumed already running.
- **Pass/fail:** Gatling **assertions** — zero failed requests + p95 < `MAXMS`.
  Unlike JMeter, Gatling **fails the build natively** on a breached assertion, so
  `mvn gatling:test` exits non-zero on its own — the gate is the tool's own exit
  code (no `.jtl`-parsing wrapper).
- **Report:** native HTML at `gatling/results/<sim>-<timestamp>/index.html`
  (gitignored).
- **Prereqs:** a JDK (17+) and Maven (`brew install maven` brings both). The
  Gatling version is **pinned in `gatling/pom.xml`** and pulled by Maven — not
  vendored. The Scala/JVM toolchain lives entirely under `gatling/`, so it never
  affects `npm run build`/`lint`.

### Accessibility (axe)

A different test *type* again: automated **WCAG accessibility** auditing with
[`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright),
run through the existing Playwright setup (so it reads the same `E2E_BASE_URL`
and assumes the app is already running).

```bash
npm run test:a11y                                    # default localhost:3000
E2E_BASE_URL=https://shop.example.com npm run test:a11y   # against a deployed UI
```

- **What it audits:** `e2e/a11y.spec.ts` scans the main pages — `/` (storefront),
  `/products/[id]`, `/login`, `/register`, `/cart` (populated), `/checkout`
  (populated, authed), `/orders/[id]` (authed). Public pages are scanned
  unauthenticated; protected pages after a login step. `/orders/[id]` uses a
  synthetic localStorage-seeded order (axe checks markup, not backend
  convergence).
- **Scan set:** WCAG A/AA — tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- **Severity gate:** the test **fails only on `serious` + `critical`** violations
  (the `GATED_IMPACTS` constant at the top of the spec); `moderate`/`minor` are
  printed as info but don't fail. Tighten by adding levels to that constant.
- **Isolation:** a dedicated Playwright **project** (`a11y`). `npm run test:e2e`
  is `--project=chromium` and ignores the a11y spec, so the functional suite runs
  exactly its tests; `npm run test:a11y` is `--project=a11y`.
- **It surfaces real issues by design** — this chunk *adds the audit*, it doesn't
  fix findings. See the chunk-13 PR for the current results.

### SAST (Semgrep)

Static security analysis of the **app source** — Semgrep reads the code for
vulnerable patterns. It does **not** run the app or use `E2E_BASE_URL` (this is
source-time security, independent of the test-target convention). Full details
in [`semgrep/README.md`](semgrep/README.md).

```bash
npm run test:sast      # or: bash semgrep/run.sh
```

- **What it scans:** the shipped app source — `app/` (incl. BFF routes under
  `app/api/**`), `lib/`, `components/`. The test suites, `node_modules`, `.next`,
  `public`, and `k8s` are excluded (SAST is the app you ship, not harnesses or
  deploy YAML).
- **Rulesets:** the Semgrep registry packs `p/typescript`, `p/javascript`,
  `p/react`, `p/nextjs`, `p/security-audit`, `p/secrets`.
- **Severity gate:** exits non-zero **only on `ERROR`** findings
  (`GATED_SEVERITY` in `run.sh`); `WARNING`/`INFO` are reported, not gated.
  (Many security rules are `WARNING`, so they're reported — widen the constant
  to gate them.)
- **Runner:** a **pinned Semgrep container** (`semgrep/semgrep:1.97.0`) via
  Docker — version fixed in the image tag, isolated from `npm run build`/`lint`.
  A scan that can't complete (bad config / no registry network) fails loudly,
  never silently green.
- **Source-vs-image security split:** Semgrep is *source-time* (patterns in the
  code); **Trivy** (below) is *artifact-time* (known CVEs in the built image).
  Together they're the full security story.

### Container image scan (Trivy)

The **artifact** half of the security pair: Trivy scans the built **image** for
known CVEs in OS packages + node deps that actually ship. It doesn't run the app
or use `E2E_BASE_URL`. Full details in [`trivy/README.md`](trivy/README.md).

```bash
npm run test:trivy        # build the image locally, then scan it (default)
TRIVY_IMAGE=ghcr.io/neuralnimbus22/order-demo-ui:latest npm run test:trivy   # scan the published image
```

- **What it scans (default, Option A):** builds the image from the repo
  Dockerfile, `docker save`s it, and scans the tar via `--input` — self-contained,
  no docker-socket/registry auth, scans the current source's image. **Option B**
  (`TRIVY_IMAGE=<ref>`) scans the published GHCR image (public, no auth).
  Scanners: `vuln` (OS + node deps) + `secret`.
- **Severity gate:** exits non-zero **only on HIGH/CRITICAL, and only FIXABLE**
  ones (`GATED_SEVERITIES` + `GATE_FIXABLE_ONLY` in `run.sh`). MEDIUM/LOW and
  *unfixed* HIGH/CRITICAL are **reported** (the latter marked `NO FIX`) but don't
  fail the gate — failing on a CVE you can't action just trains people to ignore
  the gate; hiding it would be dishonest, so it's listed, not gated.
- **Runner:** a **pinned Trivy container** (`aquasec/trivy:0.58.1`) via Docker —
  isolated from `npm run build`/`lint`. A scan that can't complete (image not
  built, DB won't update, etc.) fails loudly and exits 2, never silently green.
- **It surfaces real CVEs by design** — a node base image + transitive deps carry
  known vulns, so a red scan is expected (and proves the scan works). This chunk
  *adds the scan*; bumping the base/deps vs. documenting is a separate decision.
  See the chunk-15 PR for the current findings.

### BFF API contract (Newman)

Contract tests for the Next.js **BFF HTTP API** (`/api/*`), run headlessly with
Newman. Each route asserts **status + response schema** (the shape the browser
depends on) — contract testing, not status-only. Full details in
[`newman/README.md`](newman/README.md).

```bash
npm run test:bff-contract        # or: bash newman/run.sh
E2E_BASE_URL=https://shop.example.com npm run test:bff-contract
```

- **This is the BFF layer, not the backend's service tests.** It hits the
  `/api/*` routes that front + orchestrate `order-demo-enterprise`; the backend
  repo's `tests/<service>/` test the services directly. Same tool family,
  different layer, no overlap.
- **Covers:** `/api/health`, `/api/products` (+`/:id` known/unknown), the auth
  flow (login bad/missing/seeded → captures the `session` cookie → `/api/auth/me`
  with/without it; register fresh/duplicate; logout), and the cookie-gated
  `/api/orders/:id/status` (401 without cookie; 200 + fulfillment schema with it,
  no order placed). **Checkout: guards only** — logged-out → 401, empty cart →
  400 — no real order placed (same posture as the load tests).
- **Schema:** `pm.response.to.have.jsonSchema` + explicit typed-field checks
  (`price` is a number, `waitingFor` is an array).
- **Runner:** a **pinned Newman container** (`postman/newman:6.1.3-alpine`).
  Newman exits non-zero on any assertion failure (native gate) or run error.
  Targets `E2E_BASE_URL`; for a host `localhost` target the container reaches the
  host via `host.docker.internal` (a real hostname passes through untouched).

## Storefront notes

Browsing is public — login is only required at checkout. The catalog has no
image URLs, so each product renders a deterministic, category-tinted SVG art
tile (`components/product-art.tsx`) keyed off its sku. The cart is purely
client state persisted to localStorage; there is no backend cart service.
`e2e/storefront.spec.ts` needs product-catalog reachable
(`kubectl -n order-demo port-forward svc/product-catalog 3005:3005`).

## Auth model

Login calls user-session through the BFF; the JWT lands in an httpOnly,
secure, sameSite=lax `session` cookie whose maxAge tracks the token's 1h
expiry. Protected pages call `requireSession()` (server-side `/validate`
check → redirect to `/login`). The user JWT gates the UI only — it is never
forwarded to order-service. `e2e/auth.spec.ts` needs user-session reachable
(`kubectl -n order-demo port-forward svc/user-session 3006:3006`); the smoke
spec runs backend-free.

## Checkout (the correlation-id flow)

`/checkout` is protected. On "Place order", the BFF route `app/api/checkout`
runs — per cart line, server-side — a fresh correlation `id` → `POST /orders`
→ `POST /payments` with the **same id** (amount re-derived from the catalog
price). An order is only "fulfilled" once inventory has seen both the
order-placed and payment-confirmed events for that id, so building the payment
half is non-negotiable. Placed ids are saved to localStorage (`sundry-orders-v1`)
and surfaced at `/orders` (confirmation + list) and `/orders/[id]`.
`e2e/checkout.spec.ts` exercises the whole chain and needs all five services
port-forwarded (user-session, product-catalog, order, payment, inventory — see
the spec header).

## Order status (the convergence view)

`/orders/[id]` polls `/api/orders/[id]/status` (→ inventory `/fulfilled/:id`)
and renders the lifecycle as a live timeline: **order placed → payment
confirmed → fulfilled**. Step states and the header badge both read the same
`Fulfillment` (`waitingFor` is honored literally, not inferred), so they stay
in lockstep. Polling stops on `fulfilled`; a `rejected` order never polls and
shows a terminal "couldn't be placed" state from its stored status.
`e2e/order-status.spec.ts` covers a real order converging to fulfilled and a
synthetic (localStorage-seeded) rejected order that must not poll.

## Environment variables

`ORDER_URL`, `PAYMENT_URL`, `INVENTORY_URL`, `PRODUCT_CATALOG_URL`,
`USER_SESSION_URL`, `SESSION_SECRET` — see `.env.example`. `auth-service` is
intentionally absent: the UI never calls it (order-service authorizes orders
internally with its own token).

## Deploy to GKE

The image builds and pushes automatically: a push to `main` that touches app
code (or the Dockerfile/workflow) runs `.github/workflows/build-images.yml`,
which builds **linux/amd64 + linux/arm64** and pushes
`ghcr.io/neuralnimbus22/order-demo-ui:latest` — same pipeline shape as the
backend repo.

Then deploy and reach it:

```bash
kubectl apply -f k8s/order-demo-ui.yaml
kubectl -n order-demo wait --for=condition=available --timeout=120s deploy/order-demo-ui
kubectl -n order-demo port-forward svc/order-demo-ui 3000:3000
# open http://localhost:3000
```

The manifest wires the BFF to the backend by in-cluster FQDNs
(`http://<service>.order-demo.svc.cluster.local:<port>`) and takes
`SESSION_SECRET` from the `order-demo-ui` Secret (a clearly-demo value lives
in the manifest; rotate it with `kubectl apply` or a secret manager).

**Cookie caveat:** the session cookie is `secure`, so reach the UI via
**localhost** (port-forward — localhost is a secure context) or HTTPS. A
bare-IP `http://` LoadBalancer would silently drop the cookie and break
login. The Service is ClusterIP on purpose; making it shareable later is a
one-line change *plus* TLS in front.

## AI-Driven Test Selection (Sentinel Pattern)

This repository uses an AI-driven test selection pattern powered by TestKube.
When a pull request is opened or updated, the following automated flow runs:

1. **GitHub Actions** (`.github/workflows/pr-sentinel.yml`) fires on every PR
   open, update, or reopen and calls the TestKube API to trigger a lightweight
   sentinel workflow (`pr-sentinel`) in the TestKube control plane.

2. **Sentinel workflow** (`pr-sentinel`) is a no-op workflow in TestKube labeled
   `tier=sentinel, app=order-demo-ui`. It does nothing except complete
   successfully, giving the AI Trigger something to react to.

3. **AI Trigger** (`pr-sentinel-ai-trigger`) watches for any workflow with
   `tier=sentinel, app=order-demo-ui` completing successfully and fires the
   AI Agent.

4. **AI Agent** (`ai-pr-test-orchestrator`) reads the PR diff via the GitHub
   MCP, classifies the changes, and routes to the appropriate test suite:
   - UI/component changes → triggers `ui-full-regression`
   - Test-only changes → triggers `ui-quick-check`
   - Docs/config only → skips all tests and explains why

### Demo branches
Branches prefixed with `feature/`, `test/`, `chore/`, or `docs/` opened as
PRs against main are ephemeral demo branches. They are closed and deleted
after the demo without merging.
