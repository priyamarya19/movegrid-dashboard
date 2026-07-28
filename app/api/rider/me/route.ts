import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// GET /api/rider/me — the logged-in rider's own profile + current vehicle.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;

  const res = await pool.query(
    `SELECT r.id, r.name, r.rider_code, r.mobile, h.hub_name, h.city AS hub_city,
       a.id AS assignment_id, to_char(a.assigned_date,'YYYY-MM-DD') AS assigned_date,
       a.allotment_code, v.ev_number, m.model_name, m.oem
     FROM ${S}.riders r
     LEFT JOIN ${S}.hubs h ON h.id = r.assigned_hub_id
     LEFT JOIN ${S}.rider_vehicle_assignments a ON a.rider_id = r.id AND a.status = 'active'
     LEFT JOIN ${S}.vehicles v ON v.id = a.vehicle_id
     LEFT JOIN ${S}.vehicle_models m ON m.id = v.model_id
     WHERE r.id = $1`,
    [guard.rider.riderId]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = res.rows[0];
  return NextResponse.json({
    name: r.name, rider_code: r.rider_code, mobile: r.mobile,
    hub: r.hub_name ? { name: r.hub_name, city: r.hub_city } : null,
    vehicle: r.ev_number
      ? { ev_number: r.ev_number, model: [r.oem, r.model_name].filter(Boolean).join(" ") || null, assigned_date: r.assigned_date, allotment_code: r.allotment_code }
      : null,
  });
}
