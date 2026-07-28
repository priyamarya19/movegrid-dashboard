import { NextRequest, NextResponse } from "next/server";
import { requireRole, userCanViewAllotments, userHasAppPage } from "@/lib/auth";
import { getChaseList } from "@/lib/collections";
import { getLedgerSummary } from "@/lib/rent";

// GET /api/collections/chase — the Collections chase list + headline summary as
// JSON for the mobile app (the dashboard page renders the same data server-side
// from lib/collections). Accessible to admins, users with the Collections app
// page enabled, or the older can_view_allotments permission.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { userId, role } = guard.session;

  const allowed =
    role === "admin" ||
    (await userHasAppPage(userId, "collections")) ||
    (await userCanViewAllotments(userId));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [summary, chase] = await Promise.all([getLedgerSummary(), getChaseList()]);
  return NextResponse.json({ summary, chase });
}
