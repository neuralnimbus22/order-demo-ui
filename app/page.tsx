// Storefront — public (browsing never requires auth; checkout is the gate).
// Server-rendered through the same typed client the BFF routes use, so the
// grid paints with data on first load. Filtering happens client-side in
// <Storefront/>.
import { listProducts, type Product } from "@/lib/backend";
import Storefront from "@/components/storefront";

export default async function Home() {
  let products: Product[] | null = null;
  try {
    products = await listProducts();
  } catch {
    products = null; // catalog unreachable — render the friendly state below
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20">
      <section className="py-12 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Sundry
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Order Smarter. Deliver Faster.
        </h1>
        <p className="mt-3 max-w-md text-base leading-7 text-stone-600">
          Home, kitchen, office, and garden essentials — picked plain, priced
          fair, shipped fast.
        </p>
      </section>

      {products === null ? (
        <div
          data-testid="catalog-error"
          className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center"
        >
          <p className="font-medium text-stone-900">
            The shelves are being restocked.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            We couldn&apos;t load the catalog — please try again in a moment.
          </p>
        </div>
      ) : (
        <Storefront products={products} />
      )}
    </main>
  );
}
