// Landing page. Placeholder until the storefront chunk replaces it with the
// product grid — but already on the final design system (stone neutrals,
// indigo accent, Geist).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <p
        data-testid="brand"
        className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600"
      >
        Sundry
      </p>
      <h1 className="mt-4 max-w-xl text-center text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
        Everyday goods, without the fuss.
      </h1>
      <p className="mt-4 max-w-md text-center text-base leading-7 text-stone-600">
        Home, kitchen, office, and garden essentials. The storefront is on its
        way — check back shortly.
      </p>
    </main>
  );
}
