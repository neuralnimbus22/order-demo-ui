import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import AccountBadge from "@/components/account-badge";

export const metadata: Metadata = { title: "Account" };

// Protected: requireSession redirects to /login when there's no valid session.
export default async function AccountPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
        Your account
      </h1>
      <p className="mt-2 text-sm text-stone-600">
        Signed in as{" "}
        <span data-testid="account-email" className="font-medium text-stone-900">
          {session.email}
        </span>
      </p>
      <div className="mt-8 inline-flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <AccountBadge />
        <span className="text-sm text-stone-600">orders placed</span>
      </div>
    </main>
  );
}
