# order-demo-ui — OpenWiki quickstart

The web UI for the [`order-demo-enterprise`](https://github.com/neuralnimbus22/order-demo-enterprise)
backend: a modern e-commerce storefront (product grid, cart, real login, checkout,
live order status) that drives the backend's six-service, event-driven fulfillment
through a browser — so the same business flows the backend's API tests cover can also
be exercised with a full stack of UI, load, and security test tools.

> This wiki is the **descriptive** documentation for the repo. The **behavioral rules**
> an agent must follow ("laws") live in [`CLAUDE.md`](../CLAUDE.md) — this wiki links to
> them but does not restate them as rules.

## What this repo is

A **Backend-for-Frontend (BFF)**: the browser talks only to this Next.js app, and the
app talks to the backend services **server-side** through route handlers under
`app/api/**`. The backend services stay `ClusterIP` (no ingress sprawl, no CORS), and
the session JWT lives in an httpOnly cookie handled only on the server.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.
- **Backend it fronts:** order (`:3002`), payment (`:3004`), inventory (`:3003`),
  product-catalog (`:3005`), user-session (`:3006`) — reached by `*_URL` env vars.
  `auth-service` (`:3001`) is intentionally **not** called by the UI.
- **The defining mechanic:** checkout is a **correlation-id** flow — every order needs a
  matched `POST /orders` + `POST /payments` with the *same* id, or it never fulfills.
  See [architecture](architecture.md#the-checkout-convergence-mechanic).

## Map of the wiki

| Page | What's in it |
|---|---|
| [architecture.md](architecture.md) | BFF topology, request flow, the two-identity model, the checkout convergence mechanic, the session-cookie model. Start here. |
| [api.md](api.md) | The BFF layer: the typed backend client (`lib/backend.ts`) and every `app/api/**` route, the checkout orchestration, and order-status polling — with `file:line` anchors. |
| [frontend.md](frontend.md) | App Router pages/routes, key components, the cart & orders localStorage stores, product art, and the `data-testid` selector contract. |
| [testing/overview.md](testing/overview.md) | The shared E2E target convention, the build/lint isolation model, and the full suite matrix. |
| [testing/suites.md](testing/suites.md) | Per-suite detail: Playwright (+axe, +convergence), Cypress, Selenium, BDD, JMeter, Gatling, Newman, Semgrep, Trivy. |
| [operations.md](operations.md) | Kubernetes manifest, the observability stack, Dockerfile, CI workflows, and the env/config conventions. |

## Run it locally

The backend runs in Kubernetes (namespace `order-demo`). Port-forward the five services
the UI uses, then point the env vars at localhost:

```bash
kubectl -n order-demo port-forward svc/order           3002:3002 &
kubectl -n order-demo port-forward svc/payment         3004:3004 &
kubectl -n order-demo port-forward svc/inventory       3003:3003 &
kubectl -n order-demo port-forward svc/product-catalog 3005:3005 &
kubectl -n order-demo port-forward svc/user-session    3006:3006 &

cp .env.example .env.local   # localhost defaults match the port-forwards
npm install
npm run dev                  # http://localhost:3000
```

Demo login (seeded by the backend's user-session service): `demo@example.com` /
`demo-password`. Full env-var reference: [operations.md](operations.md#configuration).

## Run the tests

Every E2E suite targets an **already-running** app at `E2E_BASE_URL` (default
`http://localhost:3000`) — the harness never starts the app. Functional coverage is
mirrored across Playwright, Cypress, Selenium, and a Java BDD suite; load
(JMeter/Gatling), accessibility (axe), API contract (Newman), and security
(Semgrep/Trivy) round it out. See [testing/overview.md](testing/overview.md).

## Keeping this wiki current

This wiki was generated in the OpenWiki format. After significant merges, run the
**`/update-wiki`** slash command (`.claude/commands/update-wiki.md`): it diffs `main`
against the last commit that touched `openwiki/` and surgically updates only the
affected pages — it never edits the behavioral rules in `CLAUDE.md`.
