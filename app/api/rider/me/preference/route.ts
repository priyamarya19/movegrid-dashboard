import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// POST /api/rider/me/preference { brand } — "I want this one" from the scooter
// catalog. Recorded on riders.preferred_oem and shown to ops on the rider page,
// so allotment can honour it where stock allows.
//
// NOT riders.vehicle_pref — that column means speed class and decides which KYC
// documents a rider must produce (see /api/rider/me). Overloading it would move
// riders in and out of the high-speed document requirement by accident.
//
// This is a stated preference, not a booking: it reserves nothing.
export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;

  const { brand } = await req.json().catch(() => ({}));
  const wanted = typeof brand === "string" ? brand.trim() : "";
  if (!wanted) return NextResponse.json({ error: "Choose a scooter" }, { status: 400 });

  // Must match a brand we actually stock, so the ops-facing value stays clean.
  const known = await pool.query(
    `SELECT 1 FROM ${S}.vehicle_models WHERE oem = $1 LIMIT 1`,
    [wanted]
  );
  if (!known.rows[0]) return NextResponse.json({ error: "Unknown scooter" }, { status: 400 });

  await pool.query(
    `UPDATE ${S}.riders SET preferred_oem = $1, preferred_oem_at = now() WHERE id = $2`,
    [wanted, guard.rider.riderId]
  );

  return NextResponse.json({ ok: true, brand: wanted });
}

// DELETE /api/rider/me/preference — change of mind, clears the choice.
export async function DELETE(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  await pool.query(
    `UPDATE ${schemas.ops}.riders SET preferred_oem = NULL, preferred_oem_at = NULL WHERE id = $1`,
    [guard.rider.riderId]
  );
  return NextResponse.json({ ok: true });
}
