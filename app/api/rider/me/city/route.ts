import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// POST /api/rider/me/city { hub_id } — the city step. Sets the rider's hub so
// the "visit the hub" screen knows which address and which ops number to show.
//
// A rider whose scooter is at a DIFFERENT hub is refused: their assignment and
// their collections live at that hub, and moving it from a phone would silently
// break hub-scoped reporting. Hub transfers are an ops action, not a rider one.
//
// This used to refuse anyone holding a scooter at all, without ever comparing
// the hubs — so with a single hub it refused every one of them, told them their
// scooter was at "another hub" that does not exist, and left them on a screen
// with no way forward and no way back. Fifteen riders were stuck behind it.
export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;
  const riderId = guard.rider.riderId;

  const { hub_id } = await req.json().catch(() => ({}));
  if (!hub_id) return NextResponse.json({ error: "Choose a city" }, { status: 400 });

  const hub = await pool.query(`SELECT id, hub_name, city FROM ${S}.hubs WHERE id = $1`, [hub_id]);
  if (!hub.rows[0]) return NextResponse.json({ error: "We don't operate there yet" }, { status: 400 });

  // Where their scooter actually is. The assignment's hub is the record, but it
  // was only ever filled when the client sent one — so fall back to the
  // vehicle's own hub, which is the physical truth either way.
  const active = await pool.query(
    `SELECT COALESCE(a.hub_id, v.hub_id) AS hub_id, h.hub_name
       FROM ${S}.rider_vehicle_assignments a
       JOIN ${S}.vehicles v ON v.id = a.vehicle_id
       LEFT JOIN ${S}.hubs h ON h.id = COALESCE(a.hub_id, v.hub_id)
      WHERE a.rider_id = $1 AND a.status = 'active'
      LIMIT 1`,
    [riderId]
  );
  const held = active.rows[0];

  // Only a genuine mismatch is a problem. Choosing the hub they are already at
  // is a no-op, and an assignment with no hub recorded tells us nothing to
  // object to — refusing on missing data is how riders got trapped.
  if (held?.hub_id && held.hub_id !== hub_id) {
    return NextResponse.json(
      {
        error: `Your scooter is at ${held.hub_name ?? "another hub"}. Talk to the MOVEGRID team to move it.`,
        code: "hub_mismatch",
      },
      { status: 409 }
    );
  }

  await pool.query(`UPDATE ${S}.riders SET assigned_hub_id = $1 WHERE id = $2`, [hub_id, riderId]);

  return NextResponse.json({ ok: true, hub: { id: hub.rows[0].id, name: hub.rows[0].hub_name, city: hub.rows[0].city } });
}
