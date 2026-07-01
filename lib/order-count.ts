// Order count for the account badge — how many orders this browser has placed.
// Reads the same localStorage store the checkout writes to, via readOrders()
// (lib/orders), so there is a single source of truth for "placed orders" and
// the count can never drift from the order-status view's own data.

import { readOrders } from "@/lib/orders";

export function getOrderCount(): number {
  return readOrders().length;
}
