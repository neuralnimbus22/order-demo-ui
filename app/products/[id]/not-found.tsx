import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center" data-testid="product-not-found">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Sundry
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
          We don&apos;t carry that one.
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          The product you&apos;re looking for doesn&apos;t exist or was removed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Back to the store
        </Link>
      </div>
    </main>
  );
}
