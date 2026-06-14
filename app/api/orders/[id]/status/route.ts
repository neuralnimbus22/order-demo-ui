import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFulfillment } from "@/lib/backend";

// Convergence status for one correlation id — the order-status view polls this.
// getFulfillment normalizes inventory's 404 (id not seen yet) into a
// waiting-for-both state, so right after checkout this returns 200 with
// waitingFor:["order-placed","payment-confirmed"] rather than an error.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id } = await params;
  try {
    return NextResponse.json(await getFulfillment(id));
  } catch {
    return NextResponse.json(
      { error: "Order status is unavailable right now." },
      { status: 502 },
    );
  }
}
