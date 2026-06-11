import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "./logout-button";
import CartBadge from "./cart-badge";

// Server component — auth state comes straight from the session cookie +
// user-session /validate (via getSession), so the header is always truthful
// on a full render. Client-side auth changes (login/logout) do full
// navigations, which re-renders this.
export default async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          data-testid="header-brand"
          className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600"
        >
          Sundry
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <CartBadge />
          {session ? (
            <>
              <Link
                href="/account"
                data-testid="header-email"
                className="font-medium text-stone-600 transition-colors hover:text-stone-900"
              >
                {session.email}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                data-testid="header-login"
                className="font-medium text-stone-600 transition-colors hover:text-stone-900"
              >
                Log in
              </Link>
              <Link
                href="/register"
                data-testid="header-register"
                className="rounded-full bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
