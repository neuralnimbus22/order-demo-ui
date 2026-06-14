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

Every E2E suite (Playwright now; Cypress and Selenium later, then TestKube)
follows one rule: **the app is already running at `E2E_BASE_URL`; the test
harness never starts it.** A single shared env var picks the target — default
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
