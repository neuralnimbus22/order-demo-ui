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
| `app/` | App Router pages + layouts |
| `app/api/**` | the BFF — the only code that talks to backend services |
| `lib/backend.ts` | typed backend client; reads `*_URL` env vars, never hardcodes URLs |
| `e2e/` | Playwright specs (`playwright.config.ts` at the root) |
| `.env.example` | the full env-var list with local-dev defaults |

## Environment variables

`ORDER_URL`, `PAYMENT_URL`, `INVENTORY_URL`, `PRODUCT_CATALOG_URL`,
`USER_SESSION_URL`, `SESSION_SECRET` — see `.env.example`. `auth-service` is
intentionally absent: the UI never calls it (order-service authorizes orders
internally with its own token).
