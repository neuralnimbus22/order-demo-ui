# CLAUDE.md — order-demo-ui

The web UI (Backend-for-Frontend + storefront) for the `order-demo-enterprise`
backend. This repo is the **UI half** of the order-demo system.

> **Repository documentation lives in [`openwiki/`](openwiki/quickstart.md).** The
> descriptive material that used to live in this file — architecture tours,
> backend endpoint lists, page/route walkthroughs, the per-suite testing
> inventory, deployment detail — now lives in the wiki. **This file keeps only the
> behavioral rules** ("laws") an agent must follow. Read `openwiki/quickstart.md`
> first for anything descriptive; come here for the rules.

The authoritative backend contract is the backend repo's `CLAUDE.md`,
`ARCHITECTURE.md`, `IMPLEMENTATION.md`, and `system-explorer.html`. **Read those
for exact shapes.**

---

## Behavioral rules (laws — do not violate)

### BFF boundary
- The browser talks **only to the Next.js app**. The Next.js app talks to the
  backend services **server-side**, through its own API route handlers
  (`app/api/**`). The backend services are never exposed to the browser.
- Route handlers under `app/api/**` are the BFF layer — **the only place that
  talks to backend services**.
- A small typed backend client (`lib/backend.ts`) reads the `*_URL` envs —
  **never hardcode service URLs**.

### Two identities — kept separate
- **user-session** = the **human** using the store (register / login / JWT).
  **auth-service** = authorizes an **order** inside the backend,
  server-to-server, with a static token order-service holds itself.
- The user's JWT gates the **UI**. It is **not** forwarded to order-service —
  order-service does its own auth internally. **Don't merge these two concepts or
  pass the user JWT into backend order calls.**

### The checkout mechanic — the one thing that must be right
- An order only becomes **fulfilled** when inventory has seen **both** the
  `order-placed` event (from order-service) **and** the `payment-confirmed` event
  (from payment-service) **for the same `id`**.
- So a checkout is **not** "POST /orders and done." For each order the BFF must:
  generate **one correlation `id`** (distinct from the product `sku`);
  `POST /orders { id, sku, qty }`; then `POST /payments { id, amount }` — **with
  the same `id`**.
- **If the UI only calls `/orders` and skips the matched `/payments`, the order
  hangs in `waitingFor` forever.** That hanging state is the classic trap; **do
  not let a "build the storefront" pass quietly drop the payment half.**
- Multi-item carts: one `(order, payment)` pair **per cart line**, each with its
  own correlation `id`.
- `amount` is **re-derived from the catalog price** server-side
  (`getProduct(sku)`), not the client's — the browser can't dictate the charge.
  The route is session-gated but the user JWT is **NEVER** forwarded to
  order/payment.

### Session cookie — `COOKIE_INSECURE` is a RUNTIME read
- Cookie: name `session`, httpOnly, secure, sameSite=lax, path=/, maxAge derived
  from the JWT `exp` claim. Secure-by-default but env-driven: `COOKIE_INSECURE=true`
  (set ONLY in the no-TLS in-cluster test deployment, `k8s/order-demo-ui.yaml`)
  relaxes it so the browser keeps the cookie over plain HTTP. Only the exact
  string `"true"` opts out.
- **Must be a RUNTIME read** (`lib/session.ts` → `cookieInsecure()` via
  `globalThis.process?.env?.["COOKIE_INSECURE"]`). `next build` (DefinePlugin)
  statically INLINES the literal `process.env.COOKIE_INSECURE` chain at build
  time — and the var is unset during the Docker build, so the direct form bakes
  `secure:true` into the standalone bundle and ignores the runtime env. The
  `globalThis` + bracket-access form is not that pattern, so it survives as a
  live per-request lookup. **Do NOT revert to `process.env.COOKIE_INSECURE`, and
  do NOT bake it via a Docker build-arg — the image stays secure-by-default.**
- Protected pages use the server-component guard `requireSession()`
  (`lib/auth.ts`) rather than middleware.

### Testing — the shared E2E target convention (all frameworks inherit this)
- **One env var: `E2E_BASE_URL`.** Every framework reads it for its target.
  Default when unset: `http://localhost:3000`.
- **The app is assumed already running at `E2E_BASE_URL`. The harness never
  starts it.**
- **New frameworks must read `E2E_BASE_URL`, not invent their own var.**
- The Cypress and Selenium suites are a **1:1 mirror** of the Playwright coverage
  — same flows, same `data-testid`s, same seeded demo login; **no new test logic,
  no app-code changes** (every testid they need already existed).
- Load tests (JMeter, Gatling): `POST /api/checkout` is **intentionally not
  loaded** — it places real correlation-id orders and would pollute the system
  under test. GETs by default; `POST /api/auth/login` is opt-in.

### Security testing — honesty posture
- The security suites **surface, they do not fix.** The gate is **not** loosened
  and app components are **not** edited to force green — fixing is a separate
  decision.
- A non-completing scan **exits loudly** (Semgrep/Trivy exit `2`, distinct from a
  gated finding) — **never silently green**.

### Conventions
- `data-testid` on interactive elements for resilient Playwright selectors.
- Tailwind; a cohesive design system (type scale, spacing, one accent color).
  **No placeholder/lorem styling left in.**

### Deployment / ops
- k8s manifests are validated with `kubectl --dry-run=client` and **applied by
  Lakshmi, not by the agent.**

### Working in this repo
- All PR branches in this repo are **ephemeral demo branches**. Close and delete
  after demo without merging. **Never force push to main directly.**
- Keep the laws in this file current as the app grows. After significant merges,
  run **`/update-wiki`** to refresh the descriptive docs under `openwiki/`.

---

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.
