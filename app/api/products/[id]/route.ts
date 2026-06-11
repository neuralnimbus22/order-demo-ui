import { NextResponse } from "next/server";
import { getProduct } from "@/lib/backend";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const product = await getProduct(id);
    if (!product) {
      // Real not-found, passed through (catalog 404s on unknown skus).
      return NextResponse.json({ error: "unknown product" }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch {
    return NextResponse.json(
      { error: "The catalog is unavailable right now." },
      { status: 502 },
    );
  }
}
