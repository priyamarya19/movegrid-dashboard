import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// GET /api/rider/me/hub — the hub a rider should walk into, with the ops person
// they can call. Drives the "KYC pending — visit the hub" screen.
//
// `hub: null` is a real answer, not an error: a rider who hasn't picked a city
// yet has no assigned hub. The app sends them to the city step on null and must
// NOT render it as a failure.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;

  const res = await pool.query(
    `SELECT h.id, h.hub_name, h.city, h.area, h.address, h.map_link,
            h.contact_name, h.contact_mobile
       FROM ${S}.riders r
       JOIN ${S}.hubs h ON h.id = r.assigned_hub_id
      WHERE r.id = $1`,
    [guard.rider.riderId]
  );

  const h = res.rows[0];
  if (!h) return NextResponse.json({ hub: null });

  return NextResponse.json({
    hub: {
      id: h.id,
      name: h.hub_name,
      city: h.city,
      area: h.area,
      // Fall back to area + city so the card is never blank while the full
      // address is still unset.
      address: h.address ?? ([h.area, h.city].filter(Boolean).join(", ") || null),
      // null ⇒ the app hides the directions button rather than opening nothing.
      map_link: h.map_link,
      contact: h.contact_name || h.contact_mobile
        ? { name: h.contact_name, mobile: h.contact_mobile }
        : null,
    },
  });
}
