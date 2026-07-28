import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireTester, testLoginEnabled } from "@/lib/riderAuth";

// GET /api/rider-auth/test-riders — rider list for the UAT tester picker.
// Exists ONLY on a UAT backend (schema-gated); a production deployment 404s.
export async function GET(req: NextRequest) {
  if (!testLoginEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await requireTester(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(`
    SELECT r.id, r.name, r.rider_code, r.mobile, v.ev_number
    FROM ${schemas.ops}.riders r
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments a ON a.rider_id = r.id AND a.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
    WHERE COALESCE(r.is_blacklisted, false) = false
    ORDER BY (v.ev_number IS NULL), r.name`);
  return NextResponse.json({ riders: res.rows });
}
