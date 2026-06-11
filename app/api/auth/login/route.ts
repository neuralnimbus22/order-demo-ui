import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/backend";
import { SESSION_COOKIE, sessionCookieOptions, jwtMaxAge } from "@/lib/session";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  let session;
  try {
    session = await login(email, password);
  } catch {
    return NextResponse.json(
      { error: "Sign-in is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }

  if (!session) {
    // Backend 401 is opaque (wrong password vs unknown email) — keep it that way.
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // The JWT goes into an httpOnly cookie and never reaches client JS; the
  // response body carries only what the client may render.
  const res = NextResponse.json({ email: session.email });
  res.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(jwtMaxAge(session.token)),
  );
  return res;
}
