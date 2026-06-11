// Server-side session helpers for pages and layouts (the route-handler
// equivalent lives in app/api/auth/me). Both paths resolve "am I logged in"
// the same way: the session cookie's JWT is sent to user-session GET /validate
// — the single source of truth. No local signature verification.

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateToken, type SessionClaims } from "./backend";
import { SESSION_COOKIE } from "./session";

/** The current session, or null when logged out / token expired / user-session
 * unreachable. Read-only: server components cannot clear a stale cookie —
 * /api/auth/me and the auth routes handle cookie cleanup. */
export async function getSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await validateToken(token);
  } catch {
    // user-session down → treat as logged out rather than crashing the page;
    // the login attempt will surface the real error.
    return null;
  }
}

/** Page guard for protected server components: redirects to /login when there
 * is no valid session, otherwise returns the claims for rendering. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
