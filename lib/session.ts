// Session-cookie contract — one place defines the name and flags so every
// route that sets/clears the cookie stays consistent.

export const SESSION_COOKIE = "session";

// Secure by default (production). COOKIE_INSECURE=true is set ONLY in the no-TLS
// in-cluster test environment, where the browser would otherwise drop a Secure
// cookie over plain HTTP. Anything other than the exact string "true" stays
// secure — so production cannot accidentally become insecure.
//
// This MUST be a genuine RUNTIME read. `next build` (DefinePlugin) statically
// inlines the literal `process.env.COOKIE_INSECURE` chain at build time — when
// the var is unset, baking secure:true into the standalone bundle so the runtime
// env is ignored. Reading via globalThis + bracket access is not that pattern,
// so the bundler leaves it as a live per-request lookup. Keep this form.
function cookieInsecure(): boolean {
  return globalThis.process?.env?.["COOKIE_INSECURE"] === "true";
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true, // never readable from browser JS
    secure: !cookieInsecure(),
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
