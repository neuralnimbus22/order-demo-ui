// Shared centered-card shell for the login/register pages.
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Sundry
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
            {title}
          </h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
