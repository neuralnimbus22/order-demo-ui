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
  /** Plain-language explanation of the status, surfaced as a hover tooltip. */
  hint: string;
}

const STYLES = {
  fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
} as const;

// Shopper-facing explanations. Deliberately phrased for someone checking on
// their own order, not for someone reading the convergence internals.
const HINTS = {
  fulfilled: "Your order is confirmed and on its way.",
  waitingPayment: "Your order is in, we're still confirming the payment.",
  waitingOrder: "Your payment cleared, we're still confirming the order.",
  processing: "We're putting your order together — this usually only takes a moment.",
  placed: "We've received your order and are getting it ready.",
  paymentUnconfirmed: "We haven't been able to confirm your payment yet.",
  rejected: "This order didn't go through, so you haven't been charged for it.",
} as const;

/** Live convergence (when polled) wins; otherwise the checkout-time status. */
export function badgeFor(
  checkoutStatus: OrderStatus,
  live: Fulfillment | null,
): BadgeView {
  if (live) {
    if (live.fulfilled)
      return { label: "Fulfilled", className: STYLES.fulfilled, testid: "fulfilled", hint: HINTS.fulfilled };
    if (live.waitingFor.includes("payment-confirmed") && !live.waitingFor.includes("order-placed"))
      return { label: "Waiting for payment", className: STYLES.waiting, testid: "waiting-payment", hint: HINTS.waitingPayment };
    if (live.waitingFor.includes("order-placed") && !live.waitingFor.includes("payment-confirmed"))
      return { label: "Waiting for order", className: STYLES.waiting, testid: "waiting-order", hint: HINTS.waitingOrder };
    return { label: "Processing", className: STYLES.processing, testid: "processing", hint: HINTS.processing };
  }
  switch (checkoutStatus) {
    case "placed":
      return { label: "Placed", className: STYLES.processing, testid: "placed", hint: HINTS.placed };
    case "payment-unconfirmed":
      return { label: "Payment unconfirmed", className: STYLES.waiting, testid: "payment-unconfirmed", hint: HINTS.paymentUnconfirmed };
    case "processing":
      return { label: "Processing", className: STYLES.processing, testid: "processing", hint: HINTS.processing };
    case "rejected":
      return { label: "Couldn't place", className: STYLES.rejected, testid: "rejected", hint: HINTS.rejected };
  }
}

export default function OrderStatusBadge({ view }: { view: BadgeView }) {
  return (
    <span
      data-testid={`order-badge-${view.testid}`}
      title={view.hint}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-help ${view.className}`}
    >
      {/* Decorative status dot; inherits the badge's text color. */}
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {view.label}
    </span>
  );
}
