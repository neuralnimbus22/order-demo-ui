// Visual status for an order, derived from the LIVE convergence state when we
// have it (inventory /fulfilled/:id), falling back to the checkout-time status
// before the first poll returns. Chunk 5 builds the rich convergence timeline;
// this badge is the at-a-glance summary both the list and detail views share.

import type { Fulfillment } from "@/lib/backend";
import type { OrderStatus } from "@/lib/orders";

export interface BadgeView {
  label: string;
  className: string;
  testid: string;
}

const STYLES = {
  fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
} as const;

/** Live convergence (when polled) wins; otherwise the checkout-time status. */
export function badgeFor(
  checkoutStatus: OrderStatus,
  live: Fulfillment | null,
): BadgeView {
  if (live) {
    if (live.fulfilled)
      return { label: "Fulfilled", className: STYLES.fulfilled, testid: "fulfilled" };
    if (live.waitingFor.includes("payment-confirmed") && !live.waitingFor.includes("order-placed"))
      return { label: "Waiting for payment", className: STYLES.waiting, testid: "waiting-payment" };
    if (live.waitingFor.includes("order-placed") && !live.waitingFor.includes("payment-confirmed"))
      return { label: "Waiting for order", className: STYLES.waiting, testid: "waiting-order" };
    return { label: "Processing", className: STYLES.processing, testid: "processing" };
  }
  switch (checkoutStatus) {
    case "placed":
      return { label: "Placed", className: STYLES.processing, testid: "placed" };
    case "payment-unconfirmed":
      return { label: "Payment unconfirmed", className: STYLES.waiting, testid: "payment-unconfirmed" };
    case "processing":
      return { label: "Processing", className: STYLES.processing, testid: "processing" };
    case "rejected":
      return { label: "Couldn't place", className: STYLES.rejected, testid: "rejected" };
  }
}

export default function OrderStatusBadge({ view }: { view: BadgeView }) {
  return (
    <span
      data-testid={`order-badge-${view.testid}`}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${view.className}`}
    >
      {view.label}
    </span>
  );
}
