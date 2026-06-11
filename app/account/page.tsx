import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Account" };

// Protected: requireSession redirects to /login when there's no valid
// session. This is the post-login landing until the storefront chunk gives
// orders/history a richer home.
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
      <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-sm text-stone-600">
          Your orders will appear here once the storefront opens.
        </p>
      </div>
    </main>
  );
}
