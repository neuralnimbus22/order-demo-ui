import { NextRequest, NextResponse } from "next/server";
import { register } from "@/lib/backend";

// No auto-login on success — the client routes to /login. Keeps the register
// and login flows (and their tests) independent of each other.
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

  let result;
  try {
    result = await register(email, password);
  } catch {
    return NextResponse.json(
      { error: "Registration is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }

  if (!result.ok) {
    if (result.reason === "email_exists") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }
  return NextResponse.json({ email: result.email }, { status: 201 });
}
