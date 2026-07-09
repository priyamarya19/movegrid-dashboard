import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getFinanceDetailForCell, FinanceSourceKey, FinanceBucketKey } from "@/lib/finance";

const SOURCES: FinanceSourceKey[] = ["rent", "penalties", "feesDeposits", "total"];
const BUCKETS: FinanceBucketKey[] = ["tillDate", "mtd", "lmtd", "today", "yesterday", "lastWeek"];

// GET /api/finance/detail?source=rent&bucket=mtd — the rider-level rows behind one
// Finance summary cell (admin-only).
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const source = req.nextUrl.searchParams.get("source") as FinanceSourceKey;
  const bucket = req.nextUrl.searchParams.get("bucket") as FinanceBucketKey;
  if (!SOURCES.includes(source) || !BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "invalid source or bucket" }, { status: 400 });
  }

  const rows = await getFinanceDetailForCell(source, bucket);
  return NextResponse.json({ rows });
}
