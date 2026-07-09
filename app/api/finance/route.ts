import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getFinanceSummary, getFinanceDetailRows } from "@/lib/finance";

// GET /api/finance — admin-only combined money-in summary (rent + penalties +
// onboarding fee/deposit) plus the row-level detail behind it.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const [summary, detail] = await Promise.all([getFinanceSummary(), getFinanceDetailRows()]);
  return NextResponse.json({ summary, detail });
}
