"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import ProductArt from "@/components/product-art";

export default function CartPage() {
  const { lines, hydrated, subtotal, setQty, remove } = useCart();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
        Your cart
      </h1>

      {!hydrated ? null : lines.length === 0 ? (
        <div
          data-testid="cart-empty"
          className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-14 text-center"
        >
          <p className="text-lg font-medium text-stone-900">
            Your cart is empty.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Everything in the store is a click away.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Browse the store
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            {lines.map((line) => (
              <li
                key={line.sku}
                data-testid="cart-line"
                data-sku={line.sku}
                className="flex items-center gap-4 p-4 sm:p-5"
              >
                <Link
                  href={`/products/${line.sku}`}
                  className="block h-16 w-20 shrink-0 overflow-hidden rounded-lg"
                >
                  <ProductArt
                    sku={line.sku}
                    name={line.name}
                    category=""
                    className="h-full w-full"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${line.sku}`}
                    data-testid="cart-line-name"
                    className="block truncate font-medium text-stone-900 hover:text-indigo-600"
                  >
                    {line.name}
                  </Link>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {formatPrice(line.price)} each
                  </p>
                </div>
                <div className="flex items-center rounded-full border border-stone-300">
                  <button
                    type="button"
                    aria-label={`Decrease ${line.name} quantity`}
                    data-testid="cart-line-decrease"
                    onClick={() => setQty(line.sku, line.qty - 1)}
                    className="px-3 py-1.5 text-stone-500 transition-colors hover:text-stone-900"
                  >
                    −
                  </button>
                  <span
                    data-testid="cart-line-qty"
                    className="min-w-7 text-center text-sm font-medium tabular-nums"
                  >
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${line.name} quantity`}
                    data-testid="cart-line-increase"
                    onClick={() => setQty(line.sku, line.qty + 1)}
                    className="px-3 py-1.5 text-stone-500 transition-colors hover:text-stone-900"
                  >
                    +
                  </button>
                </div>
                <p
                  data-testid="cart-line-total"
                  className="w-20 text-right text-sm font-semibold tabular-nums text-stone-900"
                >
                  {formatPrice(line.price * line.qty)}
                </p>
                <button
                  type="button"
                  aria-label={`Remove ${line.name} from cart`}
                  data-testid="cart-line-remove"
                  onClick={() => remove(line.sku)}
                  className="text-stone-400 transition-colors hover:text-red-600"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col items-end gap-4">
            <p className="text-sm text-stone-600">
              Subtotal{" "}
              <span
                data-testid="cart-subtotal"
                className="ml-2 text-lg font-semibold tabular-nums text-stone-900"
              >
                {formatPrice(subtotal)}
              </span>
            </p>
            <Link
              href="/checkout"
              data-testid="cart-checkout"
              className="rounded-full bg-indigo-600 px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Proceed to checkout
            </Link>
            <p className="text-xs text-stone-500">
              Shipping and taxes are settled at checkout.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
