// Shared formatting helpers — no "use client" directive so both server
// components (product detail) and client components (cart, grid) can call it.
export function formatPrice(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
