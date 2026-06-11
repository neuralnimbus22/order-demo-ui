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
| `npm run test:e2e` | Playwright tests (`e2e/`) — spawns the dev server itself; set `PLAYWRIGHT_BASE_URL` to target an already-running/deployed UI instead |

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

## Environment variables

`ORDER_URL`, `PAYMENT_URL`, `INVENTORY_URL`, `PRODUCT_CATALOG_URL`,
`USER_SESSION_URL`, `SESSION_SECRET` — see `.env.example`. `auth-service` is
intentionally absent: the UI never calls it (order-service authorizes orders
internally with its own token).
