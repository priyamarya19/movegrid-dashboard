import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// POST /api/rider/me/city { hub_id } — the city step. Sets the rider's hub so
// the "visit the hub" screen knows which address and which ops number to show.
//
// A rider who already HOLDS a vehicle is refused: their hub is where their
// scooter and their assignment live, and moving it from a phone would silently
// break hub-scoped collections. Hub transfers are an ops action, not a rider one.
export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;
  const riderId = guard.rider.riderId;

  const { hub_id } = await req.json().catch(() => ({}));
  if (!hub_id) return NextResponse.json({ error: "Choose a city" }, { status: 400 });

  const hub = await pool.query(`SELECT id, hub_name, city FROM ${S}.hubs WHERE id = $1`, [hub_id]);
  if (!hub.rows[0]) return NextResponse.json({ error: "We don't operate there yet" }, { status: 400 });

  const active = await pool.query(
    `SELECT 1 FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [riderId]
  );
  if (active.rows[0]) {
    return NextResponse.json(
      { error: "You already have a scooter from another hub. Talk to the MOVEGRID team to move." },
      { status: 409 }
    );
  }

  await pool.query(`UPDATE ${S}.riders SET assigned_hub_id = $1 WHERE id = $2`, [hub_id, riderId]);

  return NextResponse.json({ ok: true, hub: { id: hub.rows[0].id, name: hub.rows[0].hub_name, city: hub.rows[0].city } });
}
