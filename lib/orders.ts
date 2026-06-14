// Placed-order types + client-side persistence.
//
// Orders live in localStorage (`sundry-orders-v1`) — the sibling of the cart's
// `sundry-cart-v1`. There is no backend order-history service, so the browser
// is the record of which correlation ids this user placed; chunk 5's status
// view reads them back to poll GET /fulfilled/:id per id.
//
// This module has NO "use client" directive and no server-only import, so the
// BFF checkout route can import the *types* while the localStorage helpers
// (window-guarded) are called only from client components.

export type OrderStatus =
  | "placed" // order-placed AND payment-confirmed both accepted by the backend
  | "payment-unconfirmed" // order placed, payment did not confirm — will sit in waitingFor
  | "processing" // uncertain (kafka 502/503 or network) — /fulfilled poll is the truth
  | "rejected"; // order never placed (unknown sku / opaque upstream failure)

/** One checkout line's outcome. `id` is the correlation id the BFF generated
 * (the order id inventory converges on) — always present, even on failure, so
 * an attempted order is never lost. `trackable` is false only when no event
 * will ever arrive (rejected), so the status view knows not to poll forever. */
export interface OrderResult {
  id: string;
  sku: string;
  name: string;
  qty: number;
  amount: number; // price (from the catalog, server-derived) * qty
  status: OrderStatus;
  detail?: string;
  trackable: boolean;
}

/** A persisted order — an OrderResult plus when it was placed and which
 * checkout batch it belonged to (so the confirmation can highlight one batch). */
export interface PlacedOrder extends OrderResult {
  placedAt: string; // ISO
  batchId: string;
}

const STORAGE_KEY = "sundry-orders-v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function readOrders(): PlacedOrder[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlacedOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Prepend a freshly-placed batch (newest first), de-duplicating by id so a
 * double-submit or replay can't create phantom rows. */
export function saveOrders(batch: PlacedOrder[]): void {
  if (!canUseStorage()) return;
  const existing = readOrders().filter(
    (o) => !batch.some((b) => b.id === o.id),
  );
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...batch, ...existing]),
    );
  } catch {
    // storage full/unavailable — the just-placed batch is still returned to the
    // confirmation view in memory; tracking degrades but the order isn't lost.
  }
}

export function getOrder(id: string): PlacedOrder | undefined {
  return readOrders().find((o) => o.id === id);
}
