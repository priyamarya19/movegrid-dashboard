import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// The OEM list, from the table that actually decides whether a vehicle can be
// saved. It used to be a hardcoded array in the form, which drifted: "E-sprinto"
// was offered but had no model row, so every save failed with "Unknown
// OEM/Assembler", while "EV Juno" — 21 vehicles — could not be selected at all.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT oem,
            COUNT(*)::int AS variants,
            bool_or(COALESCE(is_high_speed,false)) AS any_high_speed
       FROM ${schemas.ops}.vehicle_models
      WHERE oem IS NOT NULL AND btrim(oem) <> ''
      GROUP BY oem
      ORDER BY oem`
  );
  return NextResponse.json({ oems: res.rows });
}
