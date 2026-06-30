import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOverdueRiders } from "@/lib/rent";

// GET /api/rent/overdue — riders with overdue rent weeks (rent_dues based),
// ordered by overdue amount. Used by the app's home "needs attention" + reminders.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json({ riders: await getOverdueRiders() });
}
