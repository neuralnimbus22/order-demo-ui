import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import CheckoutClient from "@/components/checkout-client";

export const metadata: Metadata = { title: "Checkout" };

// Protected: requireSession redirects logged-out users to /login before any
// cart/checkout UI renders. The cart itself is client state, so the actual
// review + place-order surface is the client component below.
export default async function CheckoutPage() {
  await requireSession();
  return <CheckoutClient />;
}
