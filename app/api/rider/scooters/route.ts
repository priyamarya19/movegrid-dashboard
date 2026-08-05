import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// GET /api/rider/scooters — the scooter catalog.
//
// Grouped by BRAND (vehicle_models.oem), not by model: MB/BS are battery
// variants and riders don't choose on them, so three brands means three cards.
//
// Deliberately NOT filtered by stock. This is "what MOVEGRID rents", not "what
// is free right now" — a rider deciding whether to sign up should see the whole
// range, and a brand that happens to be fully deployed today isn't gone.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT oem,
            MIN(rental_per_day)                     AS rent_min,
            MAX(rental_per_day)                     AS rent_max,
            bool_or(COALESCE(is_high_speed, false)) AS any_high_speed,
            MIN(image_url) FILTER (WHERE image_url IS NOT NULL) AS image_url,
            COUNT(*)                                AS variants
       FROM ${schemas.ops}.vehicle_models
      WHERE oem IS NOT NULL
      GROUP BY oem
      ORDER BY MIN(rental_per_day), oem`
  );

  return NextResponse.json({
    scooters: res.rows.map((r) => {
      const min = Number(r.rent_min);
      const max = Number(r.rent_max);
      return {
        brand: r.oem,
        daily_min: min,
        daily_max: max,
        weekly_min: min * 7,
        weekly_max: max * 7,
        // High-speed brands need DL + PAN before allotment (lib/highSpeedGate).
        // Surfaced so a rider isn't surprised at the counter.
        high_speed: r.any_high_speed === true,
        // null ⇒ the app shows its bundled placeholder illustration.
        image_url: r.image_url,
        variants: Number(r.variants),
      };
    }),
  });
}
