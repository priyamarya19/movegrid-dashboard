import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { getHubScope, hubScopeSql } from "@/lib/hubScope";

// GET /api/recoveries — the recovered-vehicles register, newest first, with the
// frozen outstanding (bad debt) per recovery and totals for the header strip.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const scope = await getHubScope(guard.session.userId, guard.session.role);
  const S = schemas.ops;

  const res = await pool.query(`
    SELECT rec.id, to_char(rec.recovered_date, 'YYYY-MM-DD') AS recovered_date,
      rec.reason, rec.location, rec.notes, rec.photos,
      rec.outstanding_at_recovery::int AS outstanding, rec.blacklisted, rec.recovered_by,
      r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
      v.id AS vehicle_id, v.ev_number
    FROM ${S}.vehicle_recoveries rec
    JOIN ${S}.riders r ON r.id = rec.rider_id
    JOIN ${S}.vehicles v ON v.id = rec.vehicle_id
    WHERE true${hubScopeSql(scope, "v.hub_id")}
    ORDER BY rec.recovered_date DESC, rec.created_at DESC`);

  const total = res.rows.reduce((s, r) => s + Number(r.outstanding), 0);
  return NextResponse.json({ recoveries: res.rows, total_outstanding: total });
}
