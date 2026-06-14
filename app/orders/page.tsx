import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import OrdersList from "@/components/orders-list";

export const metadata: Metadata = { title: "Your orders" };

// Protected. Doubles as the post-checkout confirmation (?placed=<batchId>
// highlights the just-placed batch) and the order list. Orders live in
// localStorage, so the list itself is a client component.
export default async function OrdersPage() {
  await requireSession();
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
