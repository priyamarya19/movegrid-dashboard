import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getHubScope } from "@/lib/hubScope";
import { getLedgerSummary } from "@/lib/rent";
import { getWeeklyCollections } from "@/lib/collections";

// GET /api/collections/overview?range=&from=&to= — the period half of the
// Collections screen, refetched when the date range changes.
//
// Only expected/collected and the weekly chart are in here. Outstanding,
// penalties and the chase list are a position as of right now, not a period
// total, so they are served once with the page and never refiltered — there is
// no stored history of who was behind in August to filter to.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;

  const scope = await getHubScope(guard.session.userId, guard.session.role);
  const p = req.nextUrl.searchParams;
  const range = { range: p.get("range"), from: p.get("from"), to: p.get("to") };

  const [summary, weekly] = await Promise.all([
    getLedgerSummary(scope, range),
    getWeeklyCollections(range),
  ]);

  return NextResponse.json({ summary, weekly });
}
