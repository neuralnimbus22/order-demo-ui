"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getOrderCount } from "@/lib/order-count";

// Cross-tab updates: re-read the count when another tab writes localStorage.
// Defined at module scope so the subscription is stable across renders.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Order-count badge for the account page. Mirrors CartBadge: a client-only
// badge that reads from localStorage and shows a count bubble. The order count
// lives in localStorage (lib/orders), which is unavailable during SSR, so the
// count is read via useSyncExternalStore — it returns the server snapshot (0)
// during SSR/first paint and the real count on the client, which keeps the two
// renders in agreement without a hydration mismatch.
export default function AccountBadge() {
  const count = useSyncExternalStore(subscribe, getOrderCount, () => 0);

  return (
    <Link
      href="/orders"
      data-testid="account-order-badge"
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
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
        />
      </svg>
      <span className="sr-only">Orders</span>
      {count > 0 && (
        <span
          data-testid="account-order-badge-count"
          className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
