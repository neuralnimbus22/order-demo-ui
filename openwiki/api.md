# The BFF API layer

The BFF is the only code that talks to backend services. It is a thin typed client
(`lib/backend.ts`) plus a set of route handlers under `app/api/**`. See
[architecture.md](architecture.md) for why the boundary exists; the rules are in
[`CLAUDE.md`](../CLAUDE.md).

## The typed backend client — `lib/backend.ts`

One module owns every backend URL and call. It is `server-only` (`lib/backend.ts:11`),
reads the five `*_URL` envs (`:13-19`), sets a `TIMEOUT_MS = 5_000` (`:23`), and wraps
each call in a `request()` helper that uses `fetch` with `cache:"no-store"` +
`AbortSignal.timeout` (`:38-48`). Failures throw a `BackendError` carrying the service
name, upstream status, and parsed body (`:27-36`).

| Function | Backend call | Notes | Source |
|---|---|---|---|
| `listProducts()` | `GET product-catalog /products` | storefront listing | `lib/backend.ts:69-73` |
| `getProduct(sku)` | `GET /products/:sku` | returns `null` on 404 | `lib/backend.ts:76-81` |
| `placeOrder({id,sku,qty})` | `POST order /orders` | expects 201; `id` is the correlation id, not the sku | `lib/backend.ts:106-118` |
| `confirmPayment({id,amount})` | `POST payment /payments` | must reuse the order's `id`; expects 201 | `lib/backend.ts:134-145` |
| `getFulfillment(id)` | `GET inventory /fulfilled/:id` | normalizes 404 into a "waiting for both" state | `lib/backend.ts:169-182` |
| `login(email,pw)` | `POST user-session /login` | `null` on 401 | `lib/backend.ts:204-213` |
| `register(...)` | `POST /register` | maps 201 / 409 / 400 | `lib/backend.ts:219-229` |
| `validateToken(token)` | `GET /validate` (Bearer) | `null` on 401 | `lib/backend.ts:232-239` |

## Session helpers

- `lib/session.ts` — the `session` cookie name (`:4`), the runtime `COOKIE_INSECURE`
  read (`:16-18`), `sessionCookieOptions(maxAge)` (`:20-28`), and `jwtMaxAge(token)`
  which decodes (does not verify) the JWT `exp`, falling back to 3600s (`:36-47`).
- `lib/auth.ts` — `getSession()` reads the cookie and calls `validateToken`, returning
  `null` on any miss (`:15-25`); `requireSession()` redirects to `/login` when there's
  no session (`:29-33`).

## API routes (`app/api/**/route.ts`)

| Method + path | Backend | Behavior | Source |
|---|---|---|---|
| `GET /api/products` | catalog | public list; 502 on failure | `app/api/products/route.ts:5-14` |
| `GET /api/products/[id]` | catalog | passes 404 through; 502 on error | `app/api/products/[id]/route.ts:4-22` |
| `POST /api/auth/login` | user-session | on success sets the session cookie (`jwtMaxAge` TTL); opaque 401; body carries only email | `app/api/auth/login/route.ts:5-47` |
| `POST /api/auth/logout` | — | clears the cookie (`sessionCookieOptions(0)`), always 200 | `app/api/auth/logout/route.ts:7-11` |
| `POST /api/auth/register` | user-session | 201 / 409 / 400; **no** auto-login | `app/api/auth/register/route.ts:6-44` |
| `GET /api/auth/me` | user-session | validates the token; clears the cookie when stale | `app/api/auth/me/route.ts:8-33` |
| `POST /api/checkout` | order + payment | the correlation-id orchestration (below) | `app/api/checkout/route.ts` |
| `GET /api/orders/[id]/status` | inventory | auth-gated; returns the fulfillment state; 502 on error | `app/api/orders/[id]/status/route.ts:9-26` |
| `GET /api/health` | — | pure liveness `{status:"ok"}`, never fans out to a backend | `app/api/health/route.ts:4-6` |

`/api/health` is liveness-only by design so a degraded backend can't kill the pod — the
k8s probes point at it ([operations.md](operations.md#kubernetes)).

## Checkout orchestration — `app/api/checkout/route.ts`

The `POST` handler gates on `getSession()` → 401 (`:128-131`), validates the body and
rejects an empty cart with 400 `empty_cart` (`:142-144`), then runs `checkoutLine()`
**sequentially** per line so one failure never aborts the others (`:146-152`), and
returns `{results}` (`:154`). Each line (`checkoutLine`, `:90-124`) mints
`id = randomUUID()`, re-derives the authoritative `amount` from the catalog price
(client price ignored, `:94-106`), then `placeOrder` (`:110`) and `confirmPayment` with
the same id (`:118`).

Partial-failure taxonomy (an id is recorded the moment any call is attempted, so an order
is never lost) — `classifyOrderFailure()` (`:39-70`) and `classifyPaymentFailure()`
(`:76-87`):

| Situation | Result status | Trackable? |
|---|---|---|
| order 404 / 400, or opaque 502 "upstream dependency unavailable", or catalog price lookup fails | `rejected` | no — no event will arrive |
| order ok, payment 502/503 | `processing` | yes (uncertain) |
| order ok, payment otherwise fails | `payment-unconfirmed` | yes (order placed, will sit in `waitingFor`) |
| order 502 "kafka publish failed" / 503 | `processing` | yes |
| both ok | `placed` | yes |

Status/result types live in `lib/orders.ts` (`OrderStatus` `:12-16`, `OrderResult`
with `trackable` `:22-31`). The client persists results to localStorage and renders the
per-order convergence view — see [frontend.md](frontend.md#order-status--convergence-view).

## Order-status polling

`GET /api/orders/[id]/status` (`app/api/orders/[id]/status/route.ts:9-26`, auth-guarded
`:13-16`) proxies inventory `getFulfillment`. The client poll loop lives in
`components/order-detail.tsx` (`POLL_MS = 2000`, `:23`): an effect with an `active` flag
and `clearTimeout` cleanup that **stops on `fulfilled`** and **skips entirely when the
order is not `trackable`** (`:39-65`).
