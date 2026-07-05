# Frontend

Next.js App Router pages under `app/`, React components under `components/`, and two
client-only stores in `lib/`. Backend access is never here — it's in the
[BFF layer](api.md). Selector and design rules are in [`CLAUDE.md`](../CLAUDE.md).

## Pages (App Router)

| Route | Access | Renders | Source |
|---|---|---|---|
| `/` | public | storefront grid (SSR products, catalog-down state) | `app/page.tsx:8-48` |
| `/products/[id]` | public | product detail; `notFound()` on missing sku | `app/products/[id]/page.tsx:19-83` (not-found UI `not-found.tsx:3-25`) |
| `/cart` | public (client) | cart page: qty steppers, remove, live subtotal | `app/cart/page.tsx:8-151` |
| `/checkout` | protected | `requireSession()` → `<CheckoutClient>` | `app/checkout/page.tsx:10-13` |
| `/orders` | protected | order list + `?placed=` confirmation | `app/orders/page.tsx:11-18` |
| `/orders/[id]` | protected | per-order convergence view | `app/orders/[id]/page.tsx:11-19` |
| `/account` | protected | email + order badge | `app/account/page.tsx:8-27` |
| `/login` | public | login form (`?registered=1` notice) | `app/login/page.tsx:7-18` |
| `/register` | public | register form | `app/register/page.tsx:7-16` |

The root layout wires fonts, a title template, and wraps `<SiteHeader>` + children in
`<CartProvider>` (`app/layout.tsx:25-43`). Browsing is public; the auth gate is checkout,
not the storefront.

## Key components

| Component | Role | Source |
|---|---|---|
| `storefront.tsx` | client category filter + product grid; inner `ProductCard` add-to-cart | `components/storefront.tsx:14-128` |
| `site-header.tsx` | **server** component; `getSession()`-driven nav (logged-in vs guest) | `components/site-header.tsx:10-64` |
| `cart-badge.tsx` | header cart icon + live count, gated on `hydrated` | `components/cart-badge.tsx:6-39` |
| `checkout-client.tsx` | reads cart → `POST /api/checkout` → `saveOrders` → clears cart → routes to `/orders?placed=` | `components/checkout-client.tsx:20-68` |
| `order-detail.tsx` | localStorage load + poll engine + terminal/timeline rendering | `components/order-detail.tsx:25-205` |
| `order-timeline.tsx` | three-step convergence timeline derived from `Fulfillment.waitingFor` | `components/order-timeline.tsx:33-145` |
| `order-status-badge.tsx` | `badgeFor()` — live status wins, else stored checkout status | `components/order-status-badge.tsx:23-46` |
| `product-art.tsx` | deterministic sku-hashed SVG art tile (catalog has no images) | `components/product-art.tsx:7-54` |
| `orders-list.tsx`, `account-badge.tsx`, `detail-purchase.tsx`, `login-form.tsx`, `register-form.tsx`, `logout-button.tsx`, `auth-card.tsx` | list view, cross-tab order badge (`useSyncExternalStore`), qty selector, auth forms/shells | `components/*` |

## Client stores (localStorage, no backend)

There is no backend cart or order-history service — both are client state:

- **Cart** — `lib/cart.tsx`: `CartProvider` holds `CartLine {sku,name,price,qty}` lines
  (`:19-24`) under key `sundry-cart-v1` (`:37`). Hydration is a one-time SSR-safe load
  effect that sets a `hydrated` flag to prevent empty-cart flicker (`:50-62`); a persist
  effect writes on change (`:65-72`). `count`/`subtotal` are derived (`:104-105`).
- **Orders** — `lib/orders.ts`: placed results are written under `sundry-orders-v1`
  (`:40`) via `saveOrders` (dedupe by id, `:46-78`); each row carries the correlation id,
  checkout-time status, `trackable`, `placedAt`, and a `batchId` (`:35-38`). The header
  order badge counts them via `lib/order-count.ts:8-10`.

## Order status / convergence view

`/orders/[id]` (`components/order-detail.tsx`) polls `GET /api/orders/[id]/status`
(→ inventory `/fulfilled/:id`) every 2s and renders the lifecycle as a live timeline:
**order placed → payment confirmed → fulfilled**. The timeline steps and the status badge
both read the **same** `Fulfillment`, honoring `waitingFor` literally rather than
inferring, so they can never disagree on screen (`order-detail.tsx:95-97`,
`order-timeline.tsx:33-72`). Polling stops on `fulfilled`; a `rejected` (non-trackable)
order never polls and shows a terminal "couldn't be placed" state from its stored status.

## The `data-testid` contract

Every interactive/assertable node carries a kebab-case `data-testid`, often paired with
`data-sku` / `data-id` / `data-status` / `data-state`. This contract is what lets the
Playwright, Cypress, and Selenium suites be **1:1 mirrors** without app-code changes
(see [testing/suites.md](testing/suites.md)). Representative ids:

- storefront: `product-card` (+`data-sku`), `product-card-link/name/price/add`,
  `product-grid`, `category-filter` (`components/storefront.tsx:20,45,51,58,90,105`)
- cart: `cart-line` (+`data-sku`), `cart-line-name/qty/increase/decrease/remove`,
  `cart-subtotal`, `cart-badge-count` (`app/cart/page.tsx`, `components/cart-badge.tsx:32`)
- checkout / orders: `place-order`, `checkout-error`, `order-row` (+`data-id`,
  `data-status`), `checkout-confirmation` (`components/checkout-client.tsx`, `orders-list.tsx`)
- convergence: `order-timeline`, `timeline-step-<key>` (+`data-state`),
  `terminal-fulfilled`/`terminal-rejected`, `order-polling`
  (`components/order-timeline.tsx:89,96,131`, `order-detail.tsx`)
- auth/detail: `login-email/password/submit/error`, `header-*`, `detail-name/price/add`,
  `account-email` (respective components)
