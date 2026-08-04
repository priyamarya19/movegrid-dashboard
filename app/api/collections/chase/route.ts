import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getHubScope } from "@/lib/hubScope";
import { getChaseList } from "@/lib/collections";
import { getLedgerSummary } from "@/lib/rent";

// GET /api/collections/chase — the Collections chase list + headline summary as
// JSON for the mobile app (the dashboard page renders the same data server-side
// from lib/collections). Accessible to admins, users with the Collections app
// page enabled, or the older can_view_allotments permission.
export async function GET(req: NextRequest) {
  // Role gate only. Chasing rent is the core job of every ops role, so this list
  // is not behind the per-user Collections page toggle — a hub incharge who is
  // trusted to collect rent has to be able to see who owes it.
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const scope = await getHubScope(guard.session.userId, guard.session.role);

  const [summary, chase] = await Promise.all([getLedgerSummary(scope), getChaseList(scope)]);
  return NextResponse.json({ summary, chase });
}
