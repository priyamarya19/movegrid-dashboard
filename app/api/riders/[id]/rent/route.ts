import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRiderCycle } from "@/lib/rent";

// GET /api/riders/[id]/rent — the rider's full weekly rent cycle (rent_dues based).
// Used by the mobile app to show the ledger and collect rent against a specific week.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const weeks = await getRiderCycle(id);
  return NextResponse.json({ weeks });
}
