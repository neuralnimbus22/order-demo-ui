"use client";

// Checkout review + place-order. Reads the cart (client state), POSTs it to the
// BFF /api/checkout (which runs the per-line correlation-id flow server-side),
// then persists the placed ids to localStorage and routes to the per-order
// confirmation. The browser never calls order/payment directly.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import {
  saveOrders,
  type OrderResult,
  type PlacedOrder,
} from "@/lib/orders";
import ProductArt from "@/components/product-art";

export default function CheckoutClient() {
  const router = useRouter();
  const { lines, hydrated, subtotal, clear } = useCart();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function placeOrder() {
    setError(null);
    setPlacing(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty })),
        }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError("We couldn't place your order. Please try again.");
        setPlacing(false);
        return;
      }
      const { results } = (await res.json()) as { results: OrderResult[] };

      // Stamp the batch and persist so the status view can poll each id. A
      // single batchId groups this checkout for the confirmation highlight.
      const batchId = results[0]?.id ?? `batch-${Date.now()}`;
      const placedAt = new Date().toISOString();
      const batch: PlacedOrder[] = results.map((r) => ({
        ...r,
        placedAt,
        batchId,
      }));
      saveOrders(batch);

      // Cart is consumed — clear it whether or not every line succeeded; failed
      // lines are recorded as orders and surfaced on the confirmation, so they
      // aren't lost, and re-checking out the same cart would double-submit.
      clear();
      router.push(`/orders?placed=${encodeURIComponent(batchId)}`);
    } catch {
      setError("We couldn't reach checkout. Please try again.");
      setPlacing(false);
    }
  }

  if (!hydrated) {
    return <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12" />;
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Checkout
        </h1>
        <div
          data-testid="checkout-empty"
          className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-14 text-center"
        >
          <p className="text-lg font-medium text-stone-900">
            Your cart is empty.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Add something before checking out.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Browse the store
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
        Checkout
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* Cart review */}
        <ul
          data-testid="checkout-lines"
          className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
        >
          {lines.map((line) => (
            <li
              key={line.sku}
              data-testid="checkout-line"
              data-sku={line.sku}
              className="flex items-center gap-4 p-4 sm:p-5"
            >
              <div className="h-14 w-16 shrink-0 overflow-hidden rounded-lg">
                <ProductArt
                  sku={line.sku}
                  name={line.name}
                  category=""
                  className="h-full w-full"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-900">
                  {line.name}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {formatPrice(line.price)} × {line.qty}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-stone-900">
                {formatPrice(line.price * line.qty)}
              </p>
            </li>
          ))}
        </ul>

        {/* Order summary */}
        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
            Order summary
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Subtotal</dt>
              <dd className="font-medium tabular-nums text-stone-900">
                {formatPrice(subtotal)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Shipping</dt>
              <dd className="font-medium text-stone-900">Free</dd>
            </div>
            <div className="mt-3 flex justify-between border-t border-stone-200 pt-3">
              <dt className="font-semibold text-stone-900">Total</dt>
              <dd
                data-testid="checkout-total"
                className="text-lg font-semibold tabular-nums text-stone-900"
              >
                {formatPrice(subtotal)}
              </dd>
            </div>
          </dl>

          {error && (
            <p
              data-testid="checkout-error"
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            data-testid="place-order"
            onClick={placeOrder}
            disabled={placing}
            className="mt-6 w-full rounded-full bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {placing ? "Placing order…" : "Place order"}
          </button>
          <p className="mt-3 text-center text-xs text-stone-500">
            This is a demo store — no real payment is taken.
          </p>
        </aside>
      </div>
    </main>
  );
}
