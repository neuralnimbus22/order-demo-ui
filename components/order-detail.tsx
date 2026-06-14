"use client";

// Per-order status. Reads the order metadata from localStorage and polls
// /api/orders/[id]/status (inventory /fulfilled/:id) until the order is
// fulfilled. Deliberately a lightweight status surface — chunk 5 replaces the
// body with the full convergence timeline; the polling + badge here prove the
// correlation id is real and trackable.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fulfillment } from "@/lib/backend";
import { getOrder, type PlacedOrder } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import OrderStatusBadge, { badgeFor } from "@/components/order-status-badge";

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

  const badge = badgeFor(order.status, live);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Link href="/orders" className="text-sm text-stone-500 hover:text-stone-900">
        ← All orders
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
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

      <dl className="mt-8 space-y-3 rounded-2xl border border-stone-200 bg-white p-6 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-600">Quantity</dt>
          <dd className="font-medium tabular-nums text-stone-900">{order.qty}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Total</dt>
          <dd className="font-medium tabular-nums text-stone-900">
            {formatPrice(order.amount)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-stone-200 pt-3">
          <dt className="text-stone-600">Order event</dt>
          <dd
            data-testid="conv-order"
            className={live?.orderPlaced ? "font-medium text-emerald-700" : "text-stone-400"}
          >
            {live?.orderPlaced ? "Received" : "Waiting…"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Payment event</dt>
          <dd
            data-testid="conv-payment"
            className={live?.paymentConfirmed ? "font-medium text-emerald-700" : "text-stone-400"}
          >
            {live?.paymentConfirmed ? "Confirmed" : "Waiting…"}
          </dd>
        </div>
      </dl>

      {order.detail && order.status !== "placed" && (
        <p className="mt-4 text-sm text-stone-500">{order.detail}</p>
      )}

      {order.trackable && !live?.fulfilled && (
        <p className="mt-4 text-xs text-stone-400">
          Refreshing automatically…
        </p>
      )}
    </main>
  );
}
