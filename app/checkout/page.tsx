import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Checkout" };

// Placeholder — the real correlation-id checkout flow (orders + payments per
// cart line) is the next chunk. Public for now; the real page gates on login.
export default function CheckoutPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center" data-testid="checkout-placeholder">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Checkout
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
          Almost there.
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Checkout opens in the next release — your cart is safe in the
          meantime.
        </p>
        <Link
          href="/cart"
          className="mt-6 inline-block rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
        >
          Back to cart
        </Link>
      </div>
    </main>
  );
}
