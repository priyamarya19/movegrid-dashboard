import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getRiderCycle } from "@/lib/rent";

// GET /api/riders/[id]/rent — the rider's full weekly rent cycle (rent_dues based).
// Used by the mobile app to show the ledger and collect rent against a specific week.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const weeks = await getRiderCycle(id);
  return NextResponse.json({ weeks });
}
