import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  BackendError,
  getProduct,
  placeOrder,
  confirmPayment,
} from "@/lib/backend";
import type { OrderResult } from "@/lib/orders";

// THE checkout orchestration. The browser never touches order/payment — it
// POSTs the cart here and the BFF runs, PER LINE and server-side:
//   1. id = randomUUID()  — the correlation id (the order id, NOT the sku)
//   2. POST /orders   { id, sku, qty }
//   3. POST /payments { id, amount }   — SAME id, amount derived from the
//      CATALOG price (not the client's), so the browser can't set the charge.
// An order is only "fulfilled" once inventory has seen BOTH events for the id;
// skipping the matched payment, or using a different id, hangs it forever.
//
// The user's session gates this route but is NEVER forwarded to order-service
// (it does its own internal auth). Lines are independent: one line's failure
// does not abort the others.

interface IncomingLine {
  sku: string;
  name: string;
  qty: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Order-call failure → outcome. 404/400 and the opaque pre-publish 502 are
// definite no-event failures (not trackable). Kafka 502/503 and network errors
// are uncertain — the event may have published, so record + track and let the
// /fulfilled poll be the source of truth.
function classifyOrderFailure(err: unknown): {
  status: OrderResult["status"];
  detail: string;
  trackable: boolean;
} {
  if (err instanceof BackendError) {
    const code = err.status;
    const reason = (err.body as { error?: string } | null)?.error;
    if (code === 404)
      return { status: "rejected", detail: "This item is no longer available.", trackable: false };
    if (code === 400)
      return { status: "rejected", detail: "We couldn't place this item.", trackable: false };
    if (code === 502 && reason === "upstream dependency unavailable")
      return {
        status: "rejected",
        detail: "We couldn't place this order right now. Please try again.",
        trackable: false,
      };
    // 502 "kafka publish failed", 503 "producer not ready", any other 5xx → uncertain
    return {
      status: "processing",
      detail: "Your order is processing — we're confirming it.",
      trackable: true,
    };
  }
  // timeout / network — uncertain
  return {
    status: "processing",
    detail: "Your order is processing — we're confirming it.",
    trackable: true,
  };
}

// Payment-call failure (the order is ALREADY placed). Kafka 502/503 are
// uncertain → "processing". Anything else (timeout, unexpected status) → the
// order is placed but payment didn't confirm; it will sit in waitingFor until
// the truth is known. Either way: record the id, never retry the order.
function classifyPaymentFailure(err: unknown): {
  status: OrderResult["status"];
  detail: string;
} {
  if (err instanceof BackendError && (err.status === 502 || err.status === 503)) {
    return { status: "processing", detail: "Order placed — confirming payment." };
  }
  return {
    status: "payment-unconfirmed",
    detail: "Order placed, but payment didn't confirm yet. Tracking it.",
  };
}

async function checkoutLine(line: IncomingLine): Promise<OrderResult> {
  const id = randomUUID();
  const base = { id, sku: line.sku, name: line.name, qty: line.qty };

  // Authoritative price from the catalog — the client-sent price is ignored.
  let price: number;
  try {
    const product = await getProduct(line.sku);
    if (!product) {
      return { ...base, amount: 0, status: "rejected", detail: "This item is no longer available.", trackable: false };
    }
    price = product.price;
  } catch {
    // catalog unreachable — we can't price the line, and /orders would 502
    // anyway. Reject cleanly rather than charge an unverified amount.
    return { ...base, amount: 0, status: "rejected", detail: "We couldn't verify this item. Please try again.", trackable: false };
  }
  const amount = round2(price * line.qty);

  // Step 2 — place the order.
  try {
    await placeOrder({ id, sku: line.sku, qty: line.qty });
  } catch (err) {
    const c = classifyOrderFailure(err);
    return { ...base, amount, status: c.status, detail: c.detail, trackable: c.trackable };
  }

  // Step 3 — confirm payment with the SAME id. Order is placed; do not retry it.
  try {
    await confirmPayment({ id, amount });
  } catch (err) {
    const c = classifyPaymentFailure(err);
    return { ...base, amount, status: c.status, detail: c.detail, trackable: true };
  }

  return { ...base, amount, status: "placed", trackable: true };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { lines?: IncomingLine[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const lines = (body.lines ?? []).filter(
    (l) => l && typeof l.sku === "string" && Number.isFinite(l.qty) && l.qty > 0,
  );
  if (lines.length === 0) {
    return NextResponse.json({ error: "empty_cart" }, { status: 400 });
  }

  // Lines run sequentially: each is an independent (order,payment) pair and the
  // backend's pools are tiny, so we don't hammer them in parallel. One line's
  // failure never aborts the rest.
  const results: OrderResult[] = [];
  for (const line of lines) {
    results.push(await checkoutLine(line));
  }

  return NextResponse.json({ results });
}
