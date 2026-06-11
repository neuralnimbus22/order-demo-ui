// Typed server-side client for the order-demo backend services.
//
// This is the ONLY place that knows backend URLs. It is imported exclusively
// from app/api/** route handlers (the BFF layer) — never from client
// components. The `server-only` import makes that a build-time guarantee.
//
// Shapes below are confirmed against the backend repo's services/*/server.js
// (order-demo-enterprise), not inferred. If the backend changes, this file is
// the single point to update.

import "server-only";

const BASES = {
  order: process.env.ORDER_URL ?? "http://localhost:3002",
  payment: process.env.PAYMENT_URL ?? "http://localhost:3004",
  inventory: process.env.INVENTORY_URL ?? "http://localhost:3003",
  catalog: process.env.PRODUCT_CATALOG_URL ?? "http://localhost:3005",
  userSession: process.env.USER_SESSION_URL ?? "http://localhost:3006",
} as const;

// Per-call timeout. The backend's own inter-service calls use 2s; the BFF
// allows a little more headroom since a request may traverse two hops.
const TIMEOUT_MS = 5_000;

/** Non-2xx (and non-expected) backend response. `status` is the upstream
 * HTTP status; `body` is the parsed JSON error body when there was one. */
export class BackendError extends Error {
  constructor(
    public readonly service: keyof typeof BASES,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${service} responded ${status}`);
    this.name = "BackendError";
  }
}

async function request(
  service: keyof typeof BASES,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${BASES[service]}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// product-catalog (:3005)
// ---------------------------------------------------------------------------

/** A catalog row. `id` IS the sku. `stock` is display data only — the
 * inventory service's stock table is the source of truth for fulfillment. */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // catalog SELECTs price::float, so this is a JSON number
  description: string | null;
  stock: number;
}

export async function listProducts(): Promise<Product[]> {
  const res = await request("catalog", "/products");
  if (!res.ok) throw new BackendError("catalog", res.status, await res.json().catch(() => null));
  return json<Product[]>(res);
}

/** Returns null for an unknown sku (catalog 404s with {error:"unknown product"}). */
export async function getProduct(sku: string): Promise<Product | null> {
  const res = await request("catalog", `/products/${encodeURIComponent(sku)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new BackendError("catalog", res.status, await res.json().catch(() => null));
  return json<Product>(res);
}

// ---------------------------------------------------------------------------
// order-service (:3002)
// ---------------------------------------------------------------------------

/** 201 response from POST /orders. `item` is filled server-side from the
 * catalog product name; `sku` echoes back because we always send one. */
export interface PlacedOrder {
  id: string;
  item: string;
  qty: number;
  status: "placed";
  sku?: string;
}

/**
 * Place one order line. `id` is the per-line correlation id (a uuid the BFF
 * generates) — NOT the sku. order-service validates the sku against
 * product-catalog, calls auth internally, and only then publishes
 * `order-placed`. Failure modes (all surfaced as BackendError):
 *   404 {error:"unknown product",sku}   — sku not in the catalog
 *   502 {error:"upstream dependency unavailable"} — auth/catalog failure, opaque
 *   503 {error:"kafka producer not ready"}
 */
export async function placeOrder(input: {
  id: string;
  sku: string;
  qty: number;
}): Promise<PlacedOrder> {
  const res = await request("order", "/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status !== 201) throw new BackendError("order", res.status, await res.json().catch(() => null));
  return json<PlacedOrder>(res);
}

// ---------------------------------------------------------------------------
// payment-service (:3004)
// ---------------------------------------------------------------------------

export interface PaymentConfirmation {
  id: string;
  status: "confirmed";
}

/**
 * Confirm payment for an order line — MUST use the same correlation `id` as
 * the placeOrder call it pays for, or the order hangs in waitingFor forever.
 * `amount` must be a JSON number (the backend coerces non-numbers to 0).
 */
export async function confirmPayment(input: {
  id: string;
  amount: number;
}): Promise<PaymentConfirmation> {
  const res = await request("payment", "/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status !== 201) throw new BackendError("payment", res.status, await res.json().catch(() => null));
  return json<PaymentConfirmation>(res);
}

// ---------------------------------------------------------------------------
// inventory-service (:3003)
// ---------------------------------------------------------------------------

export type WaitingFor = "order-placed" | "payment-confirmed";

/** Convergence state for one correlation id. `fulfilled` flips true only
 * after inventory has consumed BOTH events for the id. */
export interface Fulfillment {
  id: string;
  orderPlaced: string | null; // ISO timestamp when order-placed arrived
  paymentConfirmed: string | null; // ISO timestamp when payment-confirmed arrived
  fulfilled: boolean;
  waitingFor: WaitingFor[];
}

/**
 * Poll convergence for an id. Inventory 404s for ids it hasn't seen ANY event
 * for yet (its body is already shaped like a waiting-for-both state) — that's
 * the normal state right after checkout, before Kafka delivery, so it is
 * returned as a Fulfillment rather than thrown.
 */
export async function getFulfillment(id: string): Promise<Fulfillment> {
  const res = await request("inventory", `/fulfilled/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    return {
      id,
      orderPlaced: null,
      paymentConfirmed: null,
      fulfilled: false,
      waitingFor: ["order-placed", "payment-confirmed"],
    };
  }
  if (!res.ok) throw new BackendError("inventory", res.status, await res.json().catch(() => null));
  return json<Fulfillment>(res);
}

// ---------------------------------------------------------------------------
// user-session (:3006) — the HUMAN identity service. This is the UI's login.
// (auth-service :3001 is deliberately absent from this client — order-service
// talks to it internally and the user JWT is never forwarded to it.)
// ---------------------------------------------------------------------------

export interface Session {
  token: string; // HS256 JWT, default 1h expiry
  email: string;
}

export interface SessionClaims {
  email: string;
  sub: string;
  iat: number; // epoch seconds
  exp: number; // epoch seconds
}

/** Returns null on bad credentials (the backend's 401 is opaque on purpose —
 * wrong password, unknown email, and missing fields all look identical). */
export async function login(email: string, password: string): Promise<Session | null> {
  const res = await request("userSession", "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new BackendError("userSession", res.status, await res.json().catch(() => null));
  return json<Session>(res);
}

export type RegisterResult =
  | { ok: true; email: string }
  | { ok: false; reason: "email_exists" | "invalid" };

export async function register(email: string, password: string): Promise<RegisterResult> {
  const res = await request("userSession", "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 201) return { ok: true, email };
  if (res.status === 409) return { ok: false, reason: "email_exists" };
  if (res.status === 400) return { ok: false, reason: "invalid" };
  throw new BackendError("userSession", res.status, await res.json().catch(() => null));
}

/** Returns null for a missing/malformed/expired token (backend 401). */
export async function validateToken(token: string): Promise<SessionClaims | null> {
  const res = await request("userSession", "/validate", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new BackendError("userSession", res.status, await res.json().catch(() => null));
  return json<SessionClaims>(res);
}
