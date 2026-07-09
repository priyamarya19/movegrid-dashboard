import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { getRiderCycle } from "@/lib/rent";

// GET /api/riders/[id]/rent — the rider's full weekly rent cycle (rent_dues based),
// plus paid_through_date: the rolling-balance date driving all of it (see lib/rent.ts).
// Used by the mobile app to show the ledger and collect rent.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const [weeks, asgn] = await Promise.all([
    getRiderCycle(id),
    pool.query(
      `SELECT daily_rent, to_char(COALESCE(paid_through_date, assigned_date - 1), 'YYYY-MM-DD') AS paid_through_date
       FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
      [id]
    ),
  ]);
  const a = asgn.rows[0];
  return NextResponse.json({
    weeks,
    paid_through_date: a?.paid_through_date ?? null,
    daily_rent: a?.daily_rent != null ? Number(a.daily_rent) : null,
  });
}
