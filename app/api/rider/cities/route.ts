import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// GET /api/rider/cities — cities MOVEGRID operates in, for the city step after
// login. One row per hub, driven off the hubs table: the day hub #2 opens this
// screen grows a second option with no app release.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT id, hub_name, city, area
       FROM ${schemas.ops}.hubs
      ORDER BY city, hub_name`
  );

  return NextResponse.json({
    cities: res.rows.map((h) => ({
      hub_id: h.id,
      hub_name: h.hub_name,
      city: h.city,
      area: h.area,
    })),
  });
}
