"use client";

// Per-order convergence view. Reads the order metadata from localStorage and
// polls /api/orders/[id]/status (inventory /fulfilled/:id), rendering the
// lifecycle as a live timeline: order placed → payment confirmed → fulfilled.
//
// The POLL ENGINE below (the effect) is intentionally unchanged from chunk 4 —
// active flag + clearTimeout cleanup, stop-on-fulfilled, and the !trackable
// skip are the correctness-critical bits. Chunk 5 only upgrades the rendered
// presentation around it. A `rejected` order is not trackable, so it never
// polls and its terminal state renders purely from the stored
// order.status/order.detail.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fulfillment } from "@/lib/backend";
import { getOrder, type PlacedOrder } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import OrderStatusBadge, { badgeFor } from "@/components/order-status-badge";
import OrderTimeline from "@/components/order-timeline";
import ProductArt from "@/components/product-art";

const POLL_MS = 2000;

export default function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<PlacedOrder | null | undefined>(undefined);
  const [live, setLive] = useState<Fulfillment | null>(null);

  // Load the order meta from localStorage after mount (undefined = loading,
  // null = not found in this browser).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOrder(getOrder(id) ?? null);
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Poll convergence until fulfilled. Only track if the order isn't a known
  // rejection (no event will ever arrive for those).
  useEffect(() => {
    if (order === undefined || order === null) return;
    if (!order.trackable) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}/status`, {
          cache: "no-store",
        });
        if (active && res.ok) {
          const data = (await res.json()) as Fulfillment;
          setLive(data);
          if (data.fulfilled) return; // stop polling once converged
        }
      } catch {
        // transient — keep polling
      }
      if (active) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, order]);

  if (order === undefined) {
    return <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12" />;
  }

  if (order === null) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <div data-testid="order-not-found" className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Order not found
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            We don&apos;t have a record of this order in this browser.
          </p>
          <Link
            href="/orders"
            className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            All orders
          </Link>
        </div>
      </main>
    );
  }

  // Badge and timeline both read the same `live` Fulfillment, so they can't
  // disagree on screen. Before the first poll (or for a rejected order) live is
  // null and badgeFor falls back to the stored checkout-time status.
  const badge = badgeFor(order.status, live);
  const isRejected = order.status === "rejected"; // not trackable → never polled
  const isFulfilled = !!live?.fulfilled;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Link href="/orders" className="text-sm text-stone-500 hover:text-stone-900">
        ← All orders
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-start gap-4">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg">
          <ProductArt sku={order.sku} name={order.name} category="" className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              {order.name}
            </h1>
            <OrderStatusBadge view={badge} />
          </div>
          <p
            data-testid="order-detail-id"
            className="mt-1 break-all font-mono text-xs text-stone-500"
          >
            {order.id}
          </p>
        </div>
      </div>

      {/* Terminal: fulfilled */}
      {isFulfilled && (
        <div
          data-testid="terminal-fulfilled"
          className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
        >
          <p className="font-semibold text-emerald-800">Order fulfilled</p>
          <p className="mt-1 text-sm text-emerald-700">
            The order and payment events both arrived — your order is complete.
          </p>
        </div>
      )}

      {/* Terminal: rejected — renders from stored status/detail, never polled */}
      {isRejected && (
        <div
          data-testid="terminal-rejected"
          className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6"
        >
          <p className="font-semibold text-red-800">This order couldn&apos;t be placed</p>
          <p className="mt-1 text-sm text-red-700">
            {order.detail ??
              "We couldn't place this order, so it was never submitted. You weren't charged."}
          </p>
          <Link
            href={`/products/${order.sku}`}
            className="mt-4 inline-block rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Try again
          </Link>
        </div>
      )}

      {/* Timeline — shown for any trackable order (drives the convergence view) */}
      {!isRejected && (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Order progress
          </h2>
          <OrderTimeline live={live} />
          {order.detail && order.status !== "placed" && (
            <p
              data-testid="order-detail-note"
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {order.detail}
            </p>
          )}
          {!isFulfilled && (
            <p
              data-testid="order-polling"
              className="mt-4 flex items-center gap-2 text-xs text-stone-400"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />
              Refreshing automatically…
            </p>
          )}
        </section>
      )}

      {/* Order summary */}
      <dl className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-6 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-600">Item</dt>
          <dd className="font-medium text-stone-900">{order.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Quantity</dt>
          <dd className="font-medium tabular-nums text-stone-900">{order.qty}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-200 pt-3">
          <dt className="text-stone-600">Total</dt>
          <dd className="font-semibold tabular-nums text-stone-900">
            {formatPrice(order.amount)}
          </dd>
        </div>
      </dl>
    </main>
  );
}
