// Session-cookie contract — one place defines the name and flags so every
// route that sets/clears the cookie stays consistent.

export const SESSION_COOKIE = "session";

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true, // never readable from browser JS
    // Secure by default (production). COOKIE_INSECURE=true is set ONLY in the
    // no-TLS in-cluster test environment, where the browser would otherwise drop
    // a Secure cookie over plain HTTP. Anything other than the exact string
    // "true" stays secure — so production cannot accidentally become insecure.
    secure: process.env.COOKIE_INSECURE !== "true",
    sameSite: "lax" as const,
    path: "/",
    maxAge, // seconds; 0 deletes the cookie
  };
}

/**
 * Cookie lifetime derived from the JWT's `exp` claim so the cookie and the
 * token expire together (backend default: 1h). This only DECODES the payload —
 * it does not verify the signature; user-session's GET /validate is the sole
 * authority on token validity. Falls back to 1h if the token is undecodable.
 */
export function jwtMaxAge(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as { exp?: number };
    const ttl = Math.floor((payload.exp ?? 0) - Date.now() / 1000);
    if (Number.isFinite(ttl) && ttl > 0) return ttl;
  } catch {
    // fall through to the default
  }
  return 3600;
}
