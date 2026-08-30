import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// GET /api/write-offs — revenue we decided not to collect.
//
// Deliberately separate from bad debt: that is money a rider owed and did not
// pay, this is money we never properly billed. Filing one as the other would
// put riders who have paid every week on a defaulter list.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const res = await pool.query(`
    SELECT w.id, w.amount::float8 AS amount, w.days, w.reason, w.decided_by,
           to_char(w.occurred_on, 'YYYY-MM-DD') AS occurred_on,
           to_char(w.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS recorded_on,
           r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
           v.ev_number
      FROM ${schemas.ops}.revenue_write_offs w
      LEFT JOIN ${schemas.ops}.riders r ON r.id = w.rider_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments a ON a.id = w.assignment_id
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
     ORDER BY w.occurred_on DESC NULLS LAST, w.created_at DESC`);

  const total = res.rows.reduce((s, r) => s + Number(r.amount), 0);
  const days = res.rows.reduce((s, r) => s + Number(r.days ?? 0), 0);
  return NextResponse.json({ writeOffs: res.rows, totals: { amount: total, days, count: res.rows.length } });
}
