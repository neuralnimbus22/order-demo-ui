import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { validateToken } from "@/lib/backend";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// "Am I logged in?" — the client-facing source of truth. Validates the cookie
// JWT against user-session GET /validate on every call (no local verification).
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let claims;
  try {
    claims = await validateToken(token);
  } catch {
    return NextResponse.json(
      { error: "Session check is unavailable right now." },
      { status: 502 },
    );
  }

  if (!claims) {
    // Expired or invalid token — clear the cookie so a stale session can't
    // wedge the UI in a half-logged-in state.
    const res = NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    return res;
  }

  return NextResponse.json({ email: claims.email, exp: claims.exp });
}
