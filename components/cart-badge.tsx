"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function CartBadge() {
  const { count, hydrated } = useCart();
  return (
    <Link
      href="/cart"
      data-testid="cart-badge"
      className="relative flex items-center gap-1.5 font-medium text-stone-600 transition-colors hover:text-stone-900"
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
          d="M2.25 3h1.636a1.125 1.125 0 0 1 1.09.835L5.4 5.4m0 0 1.7 6.8a1.875 1.875 0 0 0 1.82 1.425h8.16a1.875 1.875 0 0 0 1.82-1.425l1.35-5.4A1.125 1.125 0 0 0 19.16 5.4H5.4ZM9.75 19.5a1.125 1.125 0 1 1-2.25 0 1.125 1.125 0 0 1 2.25 0Zm9 0a1.125 1.125 0 1 1-2.25 0 1.125 1.125 0 0 1 2.25 0Z"
        />
      </svg>
      <span className="sr-only">Cart</span>
      {hydrated && count > 0 && (
        <span
          data-testid="cart-badge-count"
          className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
