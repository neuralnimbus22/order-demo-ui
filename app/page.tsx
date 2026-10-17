// Storefront — public (browsing never requires auth; checkout is the gate).
// Server-rendered through the same typed client the BFF routes use, so the
// grid paints with data on first load. Filtering happens client-side in
// <Storefront/>.
import Link from "next/link";
import { getProduct, listProducts, type Product } from "@/lib/backend";
import { formatPrice } from "@/lib/format";
import Storefront from "@/components/storefront";

// The product shown in the strip above the grid.
const FEATURED_SKU = "BK-001";

export default async function Home() {
  const featured = await getProduct(FEATURED_SKU);

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
          Everyday goods, without the fuss.
        </h1>
        <p className="mt-3 max-w-md text-base leading-7 text-stone-600">
          Home, kitchen, office, and garden essentials — picked plain, priced
          fair, shipped fast.
        </p>
      </section>

      {featured && (
        <Link
          href={`/products/${featured.id}`}
          data-testid="featured-product"
          className="mb-10 flex items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-6 py-4 transition-colors hover:bg-indigo-100"
        >
          <span className="text-sm text-stone-700">
            <span className="font-semibold text-indigo-700">Featured</span>
            <span aria-hidden> · </span>
            {featured.name}
          </span>
          <span className="text-sm font-semibold text-stone-900">
            {formatPrice(featured.price)}
          </span>
        </Link>
      )}

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
