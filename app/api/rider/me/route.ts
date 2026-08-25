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
    `SELECT r.id, r.name, r.rider_code, r.mobile, r.status, r.vehicle_pref,
       r.preferred_oem, r.assigned_hub_id,
       r.kyc_submitted_at, r.aadhaar_verified, r.pan_verified, r.dl_verified,
       (r.pan IS NOT NULL AND r.pan_image_url IS NOT NULL) AS has_pan,
       (r.dl_number IS NOT NULL AND r.dl_front_url IS NOT NULL) AS has_dl,
       h.hub_name, h.city AS hub_city,
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
  // For low-speed riders PAN/DL are optional, so "documents verified" only
  // requires what their vehicle class actually demands.
  const docsNeeded = r.vehicle_pref === "high_speed"
    ? [r.aadhaar_verified, r.pan_verified, r.dl_verified]
    : [r.aadhaar_verified];
  return NextResponse.json({
    name: r.name, rider_code: r.rider_code, mobile: r.mobile, status: r.status,
    hub: r.hub_name ? { name: r.hub_name, city: r.hub_city } : null,
    // Null until the rider picks a city — the app routes to the city step on it.
    hub_chosen: !!r.assigned_hub_id,
    // Brand asked for in the scooter catalog (distinct from kyc.vehicle_pref,
    // which is the speed class that drives the document rule).
    preferred_brand: r.preferred_oem ?? null,
    vehicle: r.ev_number
      ? { ev_number: r.ev_number, model: [r.oem, r.model_name].filter(Boolean).join(" ") || null, assigned_date: r.assigned_date, allotment_code: r.allotment_code }
      : null,
    kyc: {
      submitted: !!r.kyc_submitted_at,
      docs_verified: docsNeeded.every(Boolean),
      vehicle_pref: r.vehicle_pref ?? null,
    },
    documents: {
      pan: { on_file: r.has_pan === true, verified: r.pan_verified === true },
      dl: { on_file: r.has_dl === true, verified: r.dl_verified === true },
    },
  });
}
