"use client";

// Order list + post-checkout confirmation. Reads placed orders from
// localStorage (newest first). When arrived at with ?placed=<batchId> it shows
// a success banner and highlights that checkout's lines. Each order links to
// its own status view at /orders/[id].

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { readOrders, type PlacedOrder } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import OrderStatusBadge, { badgeFor } from "@/components/order-status-badge";

function fmtPlaced(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OrdersList() {
  const placedBatch = useSearchParams().get("placed");
  const [orders, setOrders] = useState<PlacedOrder[] | null>(null);

  // localStorage is client-only, so load after mount. null = not-yet-loaded
  // (render nothing) vs [] = genuinely no orders.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOrders(readOrders());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (orders === null) {
    return <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12" />;
  }

  const justPlaced = placedBatch
    ? orders.filter((o) => o.batchId === placedBatch)
    : [];
  const anyRejected = justPlaced.some((o) => o.status === "rejected");
  const anyPlaced = justPlaced.some((o) => o.status !== "rejected");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      {justPlaced.length > 0 && (
        <div
          data-testid="checkout-confirmation"
          className={`mb-8 rounded-2xl border p-6 ${
            anyPlaced
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">
            {anyPlaced ? "Order placed — thank you!" : "We hit a problem"}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {anyPlaced
              ? "We're confirming it with our warehouse. Track each item below."
              : "None of your items could be placed. Please try again."}
            {anyPlaced && anyRejected
              ? " Some items couldn't be placed — see the flagged orders."
              : ""}
          </p>
        </div>
      )}

      {justPlaced.length === 0 && (
        <h1 className="mb-8 text-3xl font-semibold tracking-tight text-stone-900">
          Your orders
        </h1>
      )}

      {orders.length === 0 ? (
        <div
          data-testid="orders-empty"
          className="rounded-2xl border border-dashed border-stone-300 bg-white p-14 text-center"
        >
          <p className="text-lg font-medium text-stone-900">No orders yet.</p>
          <p className="mt-1 text-sm text-stone-600">
            When you check out, your orders show up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Browse the store
          </Link>
        </div>
      ) : (
        <ul data-testid="orders-list" className="space-y-3">
          {orders.map((order) => {
            const badge = badgeFor(order.status, null);
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900">
                    {order.name}
                  </p>
                  <p
                    data-testid="order-id"
                    className="mt-0.5 truncate font-mono text-xs text-stone-500"
                  >
                    {order.id}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    Placed {fmtPlaced(order.placedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm tabular-nums text-stone-600">
                    {order.qty} × · {formatPrice(order.amount)}
                  </span>
                  <OrderStatusBadge view={badge} />
                </div>
              </>
            );
            return (
              <li
                key={order.id}
                data-testid="order-row"
                data-id={order.id}
                data-status={order.status}
              >
                {order.trackable ? (
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 opacity-90">
                    {inner}
                  </div>
                )}
                {order.detail && order.status !== "placed" && (
                  <p className="mt-1 px-4 text-xs text-stone-500">
                    {order.detail}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
