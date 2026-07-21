import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { getRiderCycle, nextDueSql } from "@/lib/rent";

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
      `SELECT a.daily_rent, to_char(COALESCE(a.paid_through_date, a.assigned_date - 1), 'YYYY-MM-DD') AS paid_through_date,
         to_char(${nextDueSql("a")}, 'YYYY-MM-DD') AS next_due_date
       FROM ${schemas.ops}.rider_vehicle_assignments a WHERE a.rider_id = $1 AND a.status = 'active' LIMIT 1`,
      [id]
    ),
  ]);
  const a = asgn.rows[0];
  return NextResponse.json({
    weeks,
    paid_through_date: a?.paid_through_date ?? null,
    next_due_date: a?.next_due_date ?? null,
    daily_rent: a?.daily_rent != null ? Number(a.daily_rent) : null,
  });
}
