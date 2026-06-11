import { NextResponse } from "next/server";
import { listProducts } from "@/lib/backend";

// Public — browsing requires no auth (checkout is what gates on login).
export async function GET() {
  try {
    return NextResponse.json(await listProducts());
  } catch {
    return NextResponse.json(
      { error: "The catalog is unavailable right now." },
      { status: 502 },
    );
  }
}
