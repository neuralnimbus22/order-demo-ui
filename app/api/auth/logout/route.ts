import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// Logout is purely cookie-side: JWTs are stateless and user-session has no
// revocation endpoint, so clearing the cookie IS the logout. Always 200 —
// logging out while already logged out is not an error.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
