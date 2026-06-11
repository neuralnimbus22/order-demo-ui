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

**Local dev:** `kubectl port-forward` the five services to their `localhost:<port>` and
point the `*_URL` envs at them, then `npm run dev`.

---

## How it fits the TestKube demo

The backend gives TestKube API tests (pytest/Newman), load tests (k6), and seven
distinct failure signatures to diagnose. This UI adds the **UI-test layer**: the same
business flows, now driven through a browser with Playwright — and eventually run
in-cluster as TestKube TestWorkflows against the deployed UI. The correlation-id checkout
means a UI test also exercises the real event-driven convergence end to end, not a mock.
