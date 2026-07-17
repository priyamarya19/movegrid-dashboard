import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPendingThisWeekRiders } from "@/lib/rent";

// GET /api/rent/pending-week — riders whose CURRENT (ongoing) week is unpaid and who
// are at most one week behind. Operational "collect this week's rent" worklist; each
// carries exactly one week's rent. Overlaps Overdue by design. Shared by the app's
// "This week" tab and home count, and the dashboard.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ riders: await getPendingThisWeekRiders() });
}
