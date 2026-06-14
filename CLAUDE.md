# CLAUDE.md — order-demo-ui

The web UI for the `order-demo-enterprise` backend. This repo is the **UI half** of the
order-demo system: a modern e-commerce storefront that gives the six-service backend a
real face, so its flows can be exercised and tested through a browser (Playwright)
alongside the API and load tests already run through TestKube.

> The backend (`order-demo-enterprise`) is the system-under-test. This repo adds the
> **UI layer** on top of it. The two repos are deployed together but versioned
> separately, so the backend's CI stays clean.

---

## The goal

A **credible, modern e-commerce app** — not a demo skeleton. Product grid, cart, real
login, a checkout that actually drives the backend's event-driven fulfillment, and an
order-status view that shows it converge. It should look like a store someone would
actually use. The plainness is only in the *product data* (generic catalog items); the
*app itself* should look polished.

---

## Architecture — Backend-for-Frontend (BFF)

The browser talks **only to the Next.js app**. The Next.js app talks to the backend
services **server-side**, through its own API route handlers (`app/api/**`). The
backend services are never exposed to the browser.

```
Browser ──(same-origin)──> Next.js app
                              ├─ pages / React (client)
                              └─ app/api/** route handlers (server)  ──> backend services (ClusterIP)
```

Why BFF: the six services stay `ClusterIP` (no ingress sprawl, no CORS), and the
session JWT is held in an **httpOnly cookie** and only ever handled server-side.

### Stack
- **Next.js (App Router) + React + TypeScript**
- **Tailwind CSS** for styling
- **Playwright** for UI tests

### Service URLs are env-configured
The BFF reaches each service by a base URL from the environment, so the same code runs
in-cluster and in local dev:

| env var | in-cluster value | local dev value (via `kubectl port-forward`) |
|---|---|---|
| `ORDER_URL` | `http://order.order-demo.svc.cluster.local:3002` | `http://localhost:3002` |
| `PAYMENT_URL` | `http://payment.order-demo.svc.cluster.local:3004` | `http://localhost:3004` |
| `INVENTORY_URL` | `http://inventory.order-demo.svc.cluster.local:3003` | `http://localhost:3003` |
| `PRODUCT_CATALOG_URL` | `http://product-catalog.order-demo.svc.cluster.local:3005` | `http://localhost:3005` |
| `USER_SESSION_URL` | `http://user-session.order-demo.svc.cluster.local:3006` | `http://localhost:3006` |
| `SESSION_SECRET` | cookie-signing secret | dev default |

> `auth-service` (:3001) is **intentionally absent** from this list. The UI never calls
> it — `order-service` calls auth internally, server-to-server, with its own token. See
> "Two identities" below.

---

## Backend contract (source of truth: the backend repo)

The authoritative contract is the backend repo's `CLAUDE.md`, `ARCHITECTURE.md`,
`IMPLEMENTATION.md`, and `system-explorer.html`. **Read those for exact shapes.** The
endpoints this UI uses, summarized:

**user-session** (`:3006`) — the UI's login
- `POST /register {email,password}` → `201` · `409 email_exists` · `400`
- `POST /login {email,password}` → `200 {token,email}` · `401 invalid_credentials`
- `GET /validate` (`Authorization: Bearer <jwt>`) → `200 {email,sub,iat,exp}` · `401`
- Seeded demo user exists for an out-of-the-box login (see backend `IMPLEMENTATION.md`).

**product-catalog** (`:3005`) — the storefront
- `GET /products` → `[{ id, name, category, price, description, stock }]` (`id` is the sku)
- `GET /products/:id` → one product · `404` unknown sku

**order-service** (`:3002`) — place an order
- `POST /orders {id, qty, sku}` → `201 {id,item,qty,status:"placed"}` · `404` unknown sku
  · `502` opaque on auth/catalog failure
- `id` is a **per-checkout correlation id** (not the sku). `sku` references a catalog
  product; order-service validates it against product-catalog and fills `item` from the
  product name.

**payment-service** (`:3004`) — confirm the payment
- `POST /payments {id, amount}` → `201 {id,status:"confirmed"}`
- Uses the **same `id`** as the order it pays for.

**inventory-service** (`:3003`) — order status / fulfillment
- `GET /fulfilled/:id` → `{ fulfilled, orderPlaced, paymentConfirmed, waitingFor:[...] }`
- An order is `fulfilled` only after **both** `order-placed` and `payment-confirmed`
  events have arrived for that `id`.

---

## The checkout mechanic — the one thing that must be right

This backend is event-driven and an order only becomes **fulfilled** when inventory has
seen **both** the `order-placed` event (from order-service) **and** the
`payment-confirmed` event (from payment-service) **for the same `id`**.

So a checkout is **not** "POST /orders and done." For each order, the BFF must:

1. Generate **one correlation `id`** (e.g. a uuid) for that order. This is the order
   `id` — distinct from the product `sku`.
2. `POST /orders { id, sku, qty }` to order-service.
3. `POST /payments { id, amount }` to payment-service — **with the same `id`**.
4. The order-status view polls `GET /fulfilled/:id` and shows the convergence:
   `waitingFor:["payment-confirmed"]` → `fulfilled:true`.

**If the UI only calls `/orders` and skips the matched `/payments`, the order hangs in
`waitingFor` forever.** That hanging state is the classic trap; do not let a "build the
storefront" pass quietly drop the payment half.

Multi-item carts: one `(order, payment)` pair **per cart line**, each with its own
correlation `id`; the order-status view tracks each line's `/fulfilled/:id`. (The
backend `/orders` endpoint is single-item by design.)

---

## Two identities — kept separate

- **user-session** = the **human** using the store (register / login / JWT). This is the
  UI's auth: the BFF logs the user in, stores the JWT in an httpOnly cookie, and gates
  protected routes by validating it.
- **auth-service** = authorizes an **order** inside the backend, server-to-server, with
  a static token order-service holds itself.

The user's JWT gates the **UI**. It is **not** forwarded to order-service — order-service
does its own auth internally. Don't merge these two concepts or pass the user JWT into
backend order calls.

---

## Pages

1. **Login / Logout** — real login against user-session via the BFF; JWT in an httpOnly
   cookie; protected routes; logout clears the cookie.
2. **Storefront** — browse products (product-catalog), add to cart (frontend state
   only — no backend cart), proceed to checkout.
3. **Checkout** — review cart, place order: the BFF runs the correlation-id flow above
   (`/orders` + `/payments` per line), then routes to order status.
4. **Order status / history** — poll `/fulfilled/:id` per order and show the convergence
   (placed → waiting for payment → fulfilled). This is where the event-driven backend
   becomes visible in the UI; make it a first-class, legible view.

**Cart** is React state only (optionally persisted to `localStorage`). No backend cart
service.

### As built — auth (chunk 2)

- BFF routes: `POST /api/auth/login` (sets the cookie), `POST /api/auth/register`
  (no auto-login; client routes to `/login?registered=1`), `POST /api/auth/logout`
  (clears the cookie, always 200), `GET /api/auth/me` (validates against
  user-session `/validate`; clears the cookie on a stale/expired token).
- Cookie: name `session`, httpOnly, secure, sameSite=lax, path=/, maxAge derived
  from the JWT `exp` claim (decode-only; `/validate` remains the authority).
- Protected pages use the server-component guard `requireSession()`
  (`lib/auth.ts`) rather than middleware: the validate call runs only where a
  page actually needs auth, and the guard hands the claims straight to the page.
- Pages: `/login`, `/register`, `/account` (protected placeholder; post-login
  landing until the storefront exists). The header (server component) shows
  Login/Register or email + Logout from the same `getSession()` source of truth.

### As built — storefront + cart (chunk 3)

- BFF routes: `GET /api/products` (list), `GET /api/products/[id]` (single;
  catalog 404 passes through). Browsing is PUBLIC — the storefront and cart
  never call `requireSession`; checkout (chunk 4) is the auth gate.
- Pages: `/` is the storefront (hero + category filter pills + product grid,
  server-rendered through `lib/backend.listProducts` with a friendly
  catalog-down state); `/products/[id]` is the detail page (description, price,
  stock, qty stepper, add-to-cart) with a designed `not-found`; `/cart` is the
  cart page (qty steppers, remove, live subtotal, proceed-to-checkout);
  `/checkout` is a placeholder until chunk 4.
- Cart: `CartProvider` (`lib/cart.tsx`) holds `{sku,name,price,qty}` lines with
  add/remove/setQty/clear, persisted to localStorage (`sundry-cart-v1`),
  hydrated only after mount (SSR-safe; `hydrated` flag prevents empty-cart
  flicker). Header badge shows the live item count.
- Product images: the catalog has no image URLs, so `components/product-art.tsx`
  renders a deterministic SVG tile per product — category-tinted gradient, two
  hash-of-sku-positioned motif circles, product initials. Same sku → same tile
  everywhere (grid, detail, cart).
- `lib/format.ts` holds `formatPrice` — kept OUT of `lib/cart.tsx` on purpose:
  server components can't call exports of a `"use client"` module.

### As built — checkout (chunk 4)

- **The correlation-id flow lives in `app/api/checkout/route.ts` (POST), server-side.**
  Per cart line: `id = randomUUID()` → `placeOrder({id,sku,qty})` →
  `confirmPayment({id, amount})` with the **same id**. `amount` is re-derived
  from the catalog price (`getProduct(sku)`), not the client's — the browser
  can't dictate the charge. Lines run sequentially and independently; one
  line's failure never aborts the others. The route is session-gated but the
  user JWT is NEVER forwarded to order/payment.
- **Partial-failure taxonomy** (each line returns a status; an id is recorded
  the moment any call is attempted, so an order is never lost):
  - `/orders` 404/400, or opaque `502 "upstream dependency unavailable"`, or
    catalog price lookup fails → `rejected` (no event will arrive; not trackable).
  - `/orders` ok, `/payments` 502/503 → `processing` (uncertain; trackable).
  - `/orders` ok, `/payments` otherwise fails → `payment-unconfirmed`
    (order placed, will sit in waitingFor; trackable). Order is never retried.
  - `502 "kafka publish failed"`/`503` on `/orders` → `processing` (uncertain;
    trackable). Both ok → `placed`.
- **Order id persistence (hand-off to chunk 5):** results are written to
  localStorage `sundry-orders-v1` (`lib/orders.ts`) — sibling of the cart store,
  since there's no backend order-history service. Each row carries the
  correlation id, checkout-time status, `trackable`, and a `batchId`.
- **Pages:** `/checkout` is now protected (`requireSession`) and renders
  `components/checkout-client.tsx` (cart review + summary + Place order). On
  submit it persists the batch, clears the cart, and routes to
  `/orders?placed=<batchId>`. `/orders` (`orders-list.tsx`) is the confirmation
  + list; `/orders/[id]` (`order-detail.tsx`) is the per-order status view that
  polls `GET /api/orders/[id]/status` (→ inventory `/fulfilled/:id`) every 2s
  until fulfilled. **Chunk 5 owns the rich convergence timeline**; chunk 4's
  status view is the minimal trackable surface + the shared
  `order-status-badge.tsx`. Header gains an "Orders" link when logged in.

### As built — order status / convergence view (chunk 5)

- **`/orders/[id]` is the rich convergence view.** `components/order-detail.tsx`
  keeps chunk 4's poll engine **verbatim** (the `useEffect`: `active` flag +
  `clearTimeout` cleanup, **stop-on-fulfilled**, **skip when `!trackable`**) and
  only upgrades the rendered presentation around it.
- **Timeline** (`components/order-timeline.tsx`): three lifecycle steps —
  order placed → payment confirmed → fulfilled. Each step's state is derived
  from the **same live `Fulfillment`** the badge reads, using `waitingFor`
  honestly (`waitingFor.includes("payment-confirmed")` → that step is the
  active/waiting one) rather than inferring — so the timeline and
  `order-status-badge.tsx` can never disagree on screen. `data-state` of
  `done`/`active`/`idle` per step.
- **Terminal states:** `fulfilled` → emerald success block, polling already
  stopped. `rejected` → red "couldn't be placed" block rendered **purely from
  the stored `order.status`/`order.detail`** (no poll ever runs for a
  non-trackable order). `payment-unconfirmed`/`processing` → keep polling and
  surface the stored `detail` honestly alongside the live timeline.
- **`/orders` list** (`orders-list.tsx`) gains a placed-at timestamp; the
  `?placed=<batchId>` post-checkout confirmation behavior is unchanged.
- BFF status route (`/api/orders/[id]/status` → `getFulfillment`) and the
  `getFulfillment` 404-normalization are consumed as-is, not modified.
- **CI:** `build-images.yml` actions bumped to the Node-24-era majors
  (`checkout@v6`, `login-action@v4`, `setup-qemu-action@v4`,
  `setup-buildx-action@v4`, `build-push-action@v7`); inputs/behavior identical.

---

## Conventions

- App Router (`app/`), route handlers under `app/api/**` (the BFF layer; the only place
  that talks to backend services).
- A small typed backend client (`lib/backend.ts` or similar) that reads the `*_URL`
  envs — never hardcode service URLs.
- `data-testid` on interactive elements for resilient Playwright selectors.
- Tailwind; a cohesive design system (type scale, spacing, one accent color). Aim for a
  real storefront aesthetic — clean product cards, a cart drawer/page, a polished
  checkout. No placeholder/lorem styling left in.
- Keep this `CLAUDE.md` and `README.md` current as the app grows.

---

## Testing (Playwright)

UI tests from the start, structured to run **both locally and later as a TestKube
TestWorkflow in-cluster**. Cover the core flows: login/logout, browse → add → order,
checkout (the correlation-id path), and order status reaching `fulfilled`. Intent-based,
resilient selectors. Tests live in `tests/` (or `e2e/`) and have their own config so the
UI repo carries its own UI-test pipeline, separate from the backend's CI.

### Shared E2E target convention (chunk 7) — all frameworks inherit this

There is **one** way every E2E suite finds the app, so Playwright (now) and the
Cypress/Selenium suites (next) — and ultimately TestKube — all behave identically:

- **One env var: `E2E_BASE_URL`.** Every framework reads it for its target.
  Default when unset: `http://localhost:3000`.
- **The app is assumed already running at `E2E_BASE_URL`. The harness never
  starts it.** Playwright's `webServer` self-spawn was removed in chunk 7 — this
  is the whole point: a test runner must not behave differently locally than it
  does in-cluster, where TestKube points it at a deployed URL via env.
- Two run modes: (a) local — developer runs `npm run dev` + the five backend
  port-forwards, then the suite; (b) deployed — `E2E_BASE_URL=<url>` → the suite
  hits the running UI. Documented in `README.md` → "End-to-end tests".
- `PLAYWRIGHT_BASE_URL` was fully removed (no alias) so there is a single source
  of truth. New frameworks must read `E2E_BASE_URL`, not invent their own var.

### E2E frameworks on the convention

- **Playwright** (framework #1) — `e2e/*.spec.ts`, `npm run test:e2e`.
- **Cypress** (framework #2, chunk 8) — `cypress/e2e/*.cy.ts`, `npm run test:cypress`
  (headless) / `npm run cypress:open`. `cypress.config.ts` sets
  `e2e.baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000"` and has **no**
  dev-server config (Cypress never starts the app; it verifies `baseUrl` is reachable
  at startup, which enforces "already running"). The Cypress specs are a **1:1 mirror**
  of the Playwright coverage — same flows, same `data-testid`s, same seeded demo login;
  no new test logic, no app-code changes (every testid they need already existed).
- **Build isolation:** Cypress has its own `cypress/tsconfig.json` (Cypress + node
  types) and `cypress/**` is excluded from the root `tsconfig.json` and the ESLint
  `globalIgnores`, so Cypress specs never enter `npm run build` or `npm run lint`.
- Framework-behavior parity notes (Cypress ⇄ Playwright): `cy.intercept` + alias for
  network assertions (incl. asserting the status-poll alias has **zero** calls for the
  rejected order); explicit `{ timeout: 20000 }` on convergence assertions (Cypress's
  4s default would flake against the real backend); `cy.getCookie('session')` for cookie
  checks; `cy.visit(url, { onBeforeLoad })` to seed the synthetic rejected-order
  localStorage fixture before app scripts run.
- **Selenium** (framework #3, chunk 9) — `selenium/*.test.ts`, `npm run test:selenium`.
  Node/TS (`selenium-webdriver` + Mocha + `tsx`), headless Chrome, chromedriver
  resolved by **Selenium Manager** (no hardcoded path → CI/TestKube-portable).
  `selenium/driver.ts` reads `process.env.E2E_BASE_URL ?? "http://localhost:3000"` and
  never starts the app. Same **1:1 mirror** of the 19 flows; no app-code changes.
  Isolation mirrors Cypress: own `selenium/tsconfig.json` + scoped `selenium/.mocharc.json`,
  and `selenium` excluded from the root `tsconfig.json` + ESLint `globalIgnores`. Test
  files are `*.test.ts` so they can't collide with PW's `./e2e` testDir or Cypress's
  `*.cy.ts` pattern.
- Framework-behavior parity notes (Selenium ⇄ PW/Cypress): **no auto-wait**, so every
  visibility/navigation/text/attribute assertion goes through an explicit `WebDriverWait`
  helper in `driver.ts` (the #1 Selenium flake source, wrapped once); explicit 20s waits
  for the convergence steps; `driver.manage().getCookies()` for the session-cookie check;
  rejected-order localStorage seeded by navigate → `executeScript` → `refresh`. **Two
  assertions are outcome-based rather than network-based** (raw Selenium can't cleanly
  intercept/count XHRs): (1) the checkout happy path asserts the user-visible
  confirmation + non-empty order id + cleared cart instead of `/api/checkout` 200; (2) the
  rejected "no-poll" case asserts **state stability** — `terminal-rejected` is present at
  t=0 **and still present after a ~2.5s settle** with no timeline ever appearing (a
  non-trackable order can't transition, so "it didn't flip" is the evidence it didn't
  poll). One deliberate `getAttribute("textContent")` on the brand check: Selenium's
  `getText()` returns CSS-`text-transform`-rendered text ("SUNDRY"), so the DOM text is
  read to match PW/Cypress's `textContent` comparison ("Sundry").

---

## Deployment

Mirror the backend's conventions so it deploys the same way:
- **Dockerfile** — Next.js standalone build.
- **k8s manifest** — `Deployment` + `Service`, image `ghcr.io/neuralnimbus22/order-demo-ui:latest`,
  `imagePullPolicy: IfNotPresent`, the `*_URL` + `SESSION_SECRET` envs, readiness/liveness
  on a health route, a resources block.
- **GHCR multi-arch image** (amd64 + arm64) via the repo's own build workflow.
- Reachable by the browser via ingress / LoadBalancer / port-forward (the UI is the one
  component that *is* meant to be reachable from outside the cluster).

### As built — deployment (chunk 3.5)

- **Dockerfile**: multi-stage — build stage runs `npm ci` + `next build`
  (`output: "standalone"`); runtime is `node:20-alpine`, `USER node`, copies
  `.next/standalone` + `.next/static` + `public`, `HOSTNAME=0.0.0.0`,
  `CMD ["node","server.js"]` so SIGTERM hits the server directly. ~245MB.
- **Pipeline**: `.github/workflows/build-images.yml` mirrors the backend's —
  buildx + QEMU, `linux/amd64,linux/arm64`, pushes
  `ghcr.io/neuralnimbus22/order-demo-ui:latest` on pushes to `main` touching
  app code, the Dockerfile, or the workflow.
- **Manifest** (`k8s/order-demo-ui.yaml`): Secret (`order-demo-ui`, demo
  `session-secret`, referenced via `secretKeyRef`) + Deployment + **ClusterIP**
  Service in namespace `order-demo`, port 3000. The `*_URL` envs carry the
  in-cluster FQDNs (`http://<svc>.order-demo.svc.cluster.local:<port>`); no
  `AUTH_URL`. Probes hit `GET /api/health` (liveness-only by design — a broken
  backend degrades flows, never kills the pod). Resources 100m/128Mi →
  500m/256Mi.
- **Reaching it**: `kubectl -n order-demo port-forward svc/order-demo-ui
  3000:3000` → http://localhost:3000. The session cookie is `secure`, so use
  localhost or HTTPS — a bare-IP HTTP LoadBalancer would drop the cookie.

**Local dev:** `kubectl port-forward` the five services to their `localhost:<port>` and
point the `*_URL` envs at them, then `npm run dev`.

---

## How it fits the TestKube demo

The backend gives TestKube API tests (pytest/Newman), load tests (k6), and seven
distinct failure signatures to diagnose. This UI adds the **UI-test layer**: the same
business flows, now driven through a browser with Playwright — and eventually run
in-cluster as TestKube TestWorkflows against the deployed UI. The correlation-id checkout
means a UI test also exercises the real event-driven convergence end to end, not a mock.
