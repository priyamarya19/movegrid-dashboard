import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLedgerSummary } from "@/lib/rent";

// GET /api/rent/summary — headline rent numbers (expected/collected/overdue, %).
// Shared with the web dashboards so the app shows identical figures.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json(await getLedgerSummary());
}
