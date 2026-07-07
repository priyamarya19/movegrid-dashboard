import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getOverdueRiders } from "@/lib/rent";

// GET /api/rent/overdue — riders with overdue rent weeks (rent_dues based),
// ordered by overdue amount. Used by the app's home "needs attention" + reminders.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ riders: await getOverdueRiders() });
}
