import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import OrderDetail from "@/components/order-detail";

export const metadata: Metadata = { title: "Order status" };

// Protected per-order status view. The order metadata lives in localStorage
// (client), and the live convergence comes from /api/orders/[id]/status. This
// chunk gives a working, polling status badge; chunk 5 builds the rich
// order-placed → payment-confirmed → fulfilled convergence timeline on top.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  return <OrderDetail id={id} />;
}
