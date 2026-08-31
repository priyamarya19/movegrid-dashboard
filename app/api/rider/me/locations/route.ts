import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

/**
 * POST /api/rider/me/locations — a batch of breadcrumbs from the phone.
 *
 * Built for a bad network rather than a good one. A rider who loses signal for
 * an hour uploads the whole hour at once when they resurface, possibly twice if
 * the first attempt died halfway. So: batches, client-generated ids, and an
 * upsert that ignores anything already stored.
 *
 * Points are only accepted while the rider actually holds a scooter. If there
 * is no active assignment the batch is discarded and the phone is told to stop
 * — that is the signal to shut the background task down after a return, without
 * needing a push to reach the device.
 */
const MAX_BATCH = 500;

type Point = {
  client_id?: unknown; lat?: unknown; lng?: unknown; recorded_at?: unknown;
  accuracy_m?: unknown; speed_mps?: unknown; heading_deg?: unknown; battery_pct?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;

  const body = await req.json().catch(() => ({}));
  const points: Point[] = Array.isArray(body.points) ? body.points : [];
  if (!points.length) return NextResponse.json({ ok: true, stored: 0, tracking: true });
  if (points.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Send at most ${MAX_BATCH} points per batch`, code: "batch_too_large" },
      { status: 413 }
    );
  }

  // No scooter, no tracking. Told plainly so the phone can stop itself.
  const asgn = await pool.query(
    `SELECT id FROM ${schemas.ops}.rider_vehicle_assignments
      WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [riderId]
  );
  if (!asgn.rows[0]) {
    return NextResponse.json({ ok: true, stored: 0, tracking: false, reason: "no_active_assignment" });
  }
  const assignmentId = asgn.rows[0].id;

  // Anything malformed is dropped rather than failing the batch — one bad fix
  // from a flaky sensor must not cost the rider an hour of good history.
  const rows: (string | number | null)[][] = [];
  let rejected = 0;
  for (const p of points) {
    const lat = num(p.lat), lng = num(p.lng);
    const clientId = typeof p.client_id === "string" && UUID.test(p.client_id) ? p.client_id : null;
    const at = typeof p.recorded_at === "string" ? new Date(p.recorded_at) : null;
    if (
      !clientId || lat === null || lng === null ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      !at || Number.isNaN(at.getTime()) ||
      // A clock can be wrong; a point from next week is not a point.
      at.getTime() > Date.now() + 60 * 60 * 1000
    ) { rejected++; continue; }

    const battery = num(p.battery_pct);
    rows.push([
      riderId, assignmentId, lat, lng,
      num(p.accuracy_m), num(p.speed_mps), num(p.heading_deg),
      battery === null ? null : Math.max(0, Math.min(100, Math.round(battery))),
      at.toISOString(), clientId,
    ]);
  }

  let stored = 0;
  if (rows.length) {
    // One statement for the whole batch. ON CONFLICT makes a retry free.
    const values = rows
      .map((_, i) => `($${i * 10 + 1},$${i * 10 + 2},$${i * 10 + 3},$${i * 10 + 4},$${i * 10 + 5},$${i * 10 + 6},$${i * 10 + 7},$${i * 10 + 8},$${i * 10 + 9},$${i * 10 + 10})`)
      .join(",");
    const res = await pool.query(
      `INSERT INTO ${schemas.ops}.rider_locations
         (rider_id, assignment_id, lat, lng, accuracy_m, speed_mps, heading_deg, battery_pct, recorded_at, client_id)
       VALUES ${values}
       ON CONFLICT (client_id) DO NOTHING`,
      rows.flat()
    );
    stored = res.rowCount ?? 0;
  }

  return NextResponse.json({ ok: true, stored, rejected, duplicates: rows.length - stored, tracking: true });
}
