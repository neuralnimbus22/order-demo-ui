"use client";

// Client half of the storefront: category filtering + the product grid.
// Products arrive server-rendered from the home page (no client fetch, no
// loading flicker); filtering is pure client state over that list.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/backend";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import ProductArt from "./product-art";

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div
      data-testid="product-card"
      data-sku={product.id}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <Link
        href={`/products/${product.id}`}
        data-testid="product-card-link"
        className="block"
      >
        <div className="aspect-[4/3] w-full overflow-hidden">
          <ProductArt
            sku={product.id}
            name={product.name}
            category={product.category}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          {product.category}
        </p>
        <Link
          href={`/products/${product.id}`}
          className="mt-1 font-medium text-stone-900 hover:text-indigo-600"
          data-testid="product-card-name"
        >
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span
            data-testid="product-card-price"
            className="text-sm font-semibold text-stone-900"
          >
            {formatPrice(product.price)}
          </span>
          <button
            type="button"
            data-testid="product-card-add"
            onClick={() => {
              add({ sku: product.id, name: product.name, price: product.price });
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              added
                ? "bg-emerald-600 text-white"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {added ? "Added ✓" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Storefront({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const visible = category
    ? products.filter((p) => p.category === category)
    : products;

  return (
    <div>
      <div className="flex flex-wrap gap-2" data-testid="category-filter">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            category === null
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            data-testid={`category-${c}`}
            onClick={() => setCategory(c === category ? null : c)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
              category === c
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div
        data-testid="product-grid"
        className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
