"use client";

// Quantity selector + add-to-cart for the product-detail page.
import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/backend";
import { useCart } from "@/lib/cart";

export default function DetailPurchase({ product }: { product: Product }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const max = Math.max(1, Math.min(product.stock || 99, 99));

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-full border border-stone-300 bg-white">
          <button
            type="button"
            aria-label="Decrease quantity"
            data-testid="detail-qty-decrease"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-3.5 py-2 text-stone-500 transition-colors hover:text-stone-900 disabled:opacity-40"
            disabled={qty <= 1}
          >
            −
          </button>
          <span
            data-testid="detail-qty"
            className="min-w-8 text-center text-sm font-medium tabular-nums"
          >
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            data-testid="detail-qty-increase"
            onClick={() => setQty((q) => Math.min(max, q + 1))}
            className="px-3.5 py-2 text-stone-500 transition-colors hover:text-stone-900 disabled:opacity-40"
            disabled={qty >= max}
          >
            +
          </button>
        </div>
        <button
          type="button"
          data-testid="detail-add"
          onClick={() => {
            add({ sku: product.id, name: product.name, price: product.price }, qty);
            setAdded(true);
            setTimeout(() => setAdded(false), 1600);
          }}
          className={`flex-1 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-colors sm:flex-none sm:px-10 ${
            added ? "bg-emerald-600" : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {added ? "Added to cart ✓" : "Add to cart"}
        </button>
      </div>
      {added && (
        <p className="mt-3 text-sm text-stone-600">
          <Link href="/cart" className="font-medium text-indigo-600 hover:text-indigo-700">
            View cart →
          </Link>
        </p>
      )}
    </div>
  );
}
