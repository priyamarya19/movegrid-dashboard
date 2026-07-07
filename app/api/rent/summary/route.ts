import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getLedgerSummary } from "@/lib/rent";

// GET /api/rent/summary — headline rent numbers (expected/collected/overdue, %).
// Shared with the web dashboards so the app shows identical figures.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  return NextResponse.json(await getLedgerSummary());
}
