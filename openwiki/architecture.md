# Architecture

The related rules for everything on this page are in [`CLAUDE.md`](../CLAUDE.md) — this
page explains *how it works*; that file states what you must not break.

## Backend-for-Frontend (BFF)

```
Browser ──(same-origin)──> Next.js app
                              ├─ pages / React (client)
                              └─ app/api/** route handlers (server) ──> backend services (ClusterIP)
```

The browser talks **only** to the Next.js app. All backend calls happen server-side in
route handlers under `app/api/**`, through a single typed client (`lib/backend.ts`).
Two payoffs: the six backend services stay `ClusterIP` (no ingress, no CORS), and the
session JWT is only ever handled server-side.

- The typed client is the **one place** service URLs live — it reads `ORDER_URL`,
  `PAYMENT_URL`, `INVENTORY_URL`, `PRODUCT_CATALOG_URL`, `USER_SESSION_URL` from the
  environment (`lib/backend.ts:13-19`) so the same code runs in-cluster and in local
  dev. `server-only` is imported to hard-fail if the client is ever pulled into a client
  bundle (`lib/backend.ts:11`).
- Full route + client detail: [api.md](api.md).

## The services this UI talks to

| Service | Env var | Port | Used for |
|---|---|---|---|
| order | `ORDER_URL` | 3002 | place an order (`POST /orders`) |
| payment | `PAYMENT_URL` | 3004 | confirm payment (`POST /payments`) |
| inventory | `INVENTORY_URL` | 3003 | fulfillment status (`GET /fulfilled/:id`) |
| product-catalog | `PRODUCT_CATALOG_URL` | 3005 | storefront listing + product detail |
| user-session | `USER_SESSION_URL` | 3006 | human login / register / JWT validate |

`auth-service` (`:3001`) is deliberately **absent**: the UI never calls it. See the two
identities below. The authoritative request/response shapes are the backend repo's docs
(`CLAUDE.md`, `ARCHITECTURE.md`, `IMPLEMENTATION.md`).

## Two identities — kept separate

The system has two unrelated notions of "auth", and the code keeps them apart on purpose:

- **user-session** authorizes a **human** (register / login / JWT). This is the UI's
  auth: the BFF logs the user in, stores the JWT in an httpOnly cookie, and gates
  protected routes by validating it.
- **auth-service** authorizes an **order** inside the backend, server-to-server, with a
  static token order-service holds itself.

The user's JWT gates the **UI only**; it is never forwarded to order-service. Order-service
does its own auth internally. (Rule: [`CLAUDE.md` → Two identities](../CLAUDE.md).)

## The checkout convergence mechanic

This is the one thing the UI must get right, because the backend is event-driven. An
order becomes **fulfilled** only after inventory has consumed **both** events for the
same id:

```
order-service  ── order-placed ──────┐
                                      ├──> inventory: fulfilled when BOTH seen for one id
payment-service ── payment-confirmed ─┘
```

So a checkout is not "POST /orders and done." For each cart line the BFF, server-side in
`app/api/checkout/route.ts`:

1. generates one correlation `id = randomUUID()` — distinct from the product `sku`
   (`app/api/checkout/route.ts:90`);
2. re-derives `amount` from the **catalog** price, ignoring the client's number
   (`:94-106`);
3. `placeOrder({id, sku, qty})` → order-service (`:110`);
4. `confirmPayment({id, amount})` → payment-service, **same id** (`:118`).

If the payment half is skipped, the order sits in `waitingFor` forever — the classic
trap this design exists to expose. Lines run sequentially and independently; one line's
failure never aborts the others (`:146-152`). The partial-failure taxonomy
(`rejected` / `processing` / `payment-unconfirmed` / `placed`) is documented in
[api.md → Checkout orchestration](api.md#checkout-orchestration).

The order-status view then polls inventory `GET /fulfilled/:id` and renders the
convergence as a live timeline — see [frontend.md → Order status](frontend.md#order-status--convergence-view).

## Session & cookie model

Login calls user-session through the BFF; the returned JWT lands in a `session` cookie
(httpOnly, secure, sameSite=lax, path=/), with `maxAge` derived from the token's `exp`
claim (`lib/session.ts:20-47`). Protected pages use the server-component guard
`requireSession()` (`lib/auth.ts:29-33`), which validates against user-session
`/validate` and redirects to `/login` when there's no valid session — validation runs
only where a page needs it, rather than in middleware.

The cookie is **secure-by-default**. The `COOKIE_INSECURE` escape hatch (for the no-TLS
in-cluster test deployment) is read at **runtime** via
`globalThis.process?.env?.["COOKIE_INSECURE"]` (`lib/session.ts:16-18`) — a deliberate
shape that survives `next build`'s static inlining. This is a load-bearing detail with a
hard rule attached; see [`CLAUDE.md` → Session cookie](../CLAUDE.md) before touching it.
