import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getHubScope } from "@/lib/hubScope";
import { getLedgerSummary } from "@/lib/rent";

// GET /api/rent/summary — headline rent numbers (expected/collected/overdue, %).
// Shared with the web dashboards so the app shows identical figures.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const scope = await getHubScope(guard.session.userId, guard.session.role);
  return NextResponse.json(await getLedgerSummary(scope));
}
