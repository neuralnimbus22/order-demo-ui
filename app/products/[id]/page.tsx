import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/backend";
import { formatPrice } from "@/lib/format";
import ProductArt from "@/components/product-art";
import DetailPurchase from "@/components/detail-purchase";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id).catch(() => null);
  return { title: product ? product.name : "Product not found" };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let product;
  try {
    product = await getProduct(id);
  } catch {
    product = null; // catalog down reads as not-found rather than a crash
  }
  if (!product) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <nav className="text-sm text-stone-500">
        <Link href="/" className="hover:text-stone-900">
          Store
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="capitalize">{product.category}</span>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-stone-200">
          <ProductArt
            sku={product.id}
            name={product.name}
            category={product.category}
            className="aspect-[4/3] h-auto w-full"
          />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            {product.category} · {product.id}
          </p>
          <h1
            data-testid="detail-name"
            className="mt-2 text-3xl font-semibold tracking-tight text-stone-900"
          >
            {product.name}
          </h1>
          <p
            data-testid="detail-price"
            className="mt-4 text-2xl font-semibold text-stone-900"
          >
            {formatPrice(product.price)}
          </p>
          <p className="mt-4 max-w-prose text-base leading-7 text-stone-600">
            {product.description}
          </p>
          <p
            data-testid="detail-stock"
            className={`mt-4 text-sm font-medium ${
              product.stock > 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
          </p>
          <DetailPurchase product={product} />
        </div>
      </div>
    </main>
  );
}
