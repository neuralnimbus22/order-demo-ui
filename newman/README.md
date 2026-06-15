# BFF API contract tests (Newman)

Contract tests for the **Next.js BFF HTTP API** (`/api/*`) — run headlessly with
Newman (the Postman CLI). Each request asserts the route's **status + response
schema** (the JSON shape the browser depends on), so it catches a broken
contract, not just a non-200.

## This is the BFF layer — NOT the backend's service tests

There are two API-test layers, and they don't overlap:

| layer | where | what it tests |
|---|---|---|
| **BFF API contract** (this) | `newman/` here | the Next.js `/api/*` routes that **front + orchestrate** the services |
| service-level API tests | the backend repo's `tests/<service>/` | each microservice's own API, **directly** |

Same tool family (Newman/Postman), different layer. This suite hits the BFF that
sits in front of `order-demo-enterprise`; the backend repo tests the services
behind it.

## Run

```bash
npm run test:bff-contract        # or: bash newman/run.sh
E2E_BASE_URL=https://shop.example.com npm run test:bff-contract
```

Prereq: **Docker**. The Newman image is **pinned** (`postman/newman:6.1.3-alpine`)
and pulled — not vendored. The app is assumed **already running** at
`E2E_BASE_URL` (default `http://localhost:3000`), with the backend services
reachable behind the BFF (login → user-session, products → catalog, orders →
inventory) — same as the functional suites.

> **Container → host:** Newman runs in a container, so when the target is the
> host's `localhost`/`127.0.0.1`, `run.sh` rewrites it to `host.docker.internal`
> (+ `--add-host=…:host-gateway`) so the container can reach the host app. A real
> hostname (deployed / in-cluster / TestKube) passes through **untouched** — the
> rewrite is strictly conditional on localhost.

## What it covers (status + schema per route)

- **Public:** `GET /api/health` (`{status:"ok"}`), `GET /api/products` (array of
  `{id,name,category,price:number,description,stock:number}`), `GET /api/products/:id`
  (known → product; unknown → `404 {error:"unknown product"}`).
- **Auth flow:** `POST /api/auth/login` — bad password → `401 {error:"Invalid
  email or password."}` (generic, no leak), missing fields → `400`, seeded creds
  → `200 {email}` + `Set-Cookie` (the `session` value is **captured** into a
  collection variable). `GET /api/auth/me` → `401 {error:"not_authenticated"}`
  without the cookie, `200 {email,exp}` with it. `POST /api/auth/register` —
  fresh unique email → `201 {email}`, duplicate → `409`. `POST /api/auth/logout`
  → `200 {ok:true}`.
- **Protected (cookie-gated):** `GET /api/orders/:id/status` → `401` without the
  cookie; `200` + the fulfillment schema (`{id,orderPlaced,paymentConfirmed,
  fulfilled,waitingFor[]}`) with it — exercised with an arbitrary id (the BFF
  normalizes inventory's not-seen `404` into a waiting state), so **no order is
  placed**.

### Cookie handling

The `session` cookie is `httpOnly; Secure; SameSite=Lax`. Rather than rely on
Newman's cookie jar resending a `Secure` cookie over http (which behaves
differently across machines), the login test **captures** the cookie value from
the `Set-Cookie` header into a collection variable and the gated requests set
`Cookie: session={{sessionCookie}}` explicitly — deterministic.

### Checkout — guards only (no real order)

`POST /api/checkout` is contract-tested for its **guards only**: logged-out →
`401 {error:"not_authenticated"}`, and logged-in + empty cart → `400
{error:"empty_cart"}`. A **successful** checkout is deliberately **not** run — it
would place real correlation-id orders and pollute inventory, same posture as the
load tests. (The register test does create one benign user row per run via a
unique `newman-<ts>@example.com`, consistent with the functional suites.)

## Schema assertions

`pm.response.to.have.jsonSchema(schema)` (ajv-backed in Newman) for the shape,
plus explicit type checks on the critical typed fields (`price` is a `number`,
`waitingFor` is an array) — that's what makes it *contract* testing.

## Gate & trust

Newman **exits non-zero on any failed assertion** (native — no wrapper parsing),
and also on a run error (app unreachable / bad collection). `run.sh` propagates
that exit code and writes a JSON report to `newman/results/` (gitignored). A
broken run can't masquerade as green — verified: a down target and a
wrong-contract target both exit non-zero (the latter fails 35/37 assertions).
