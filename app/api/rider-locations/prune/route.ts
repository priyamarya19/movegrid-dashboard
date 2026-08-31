import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

/**
 * POST /api/rider-locations/prune — nightly.
 *
 * Location history is the one table here that grows without anyone deciding to
 * add anything. Left alone it would hold every movement of every rider for as
 * long as the company exists, which is both a storage problem and, more to the
 * point, not something to be sitting on by accident.
 *
 * Deleted in chunks so a first run against a large backlog cannot hold a lock
 * long enough to affect anything else.
 */
const RETENTION_DAYS = 90;
const CHUNK = 20000;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let deleted = 0;
  for (let pass = 0; pass < 50; pass++) {
    const res = await pool.query(
      `DELETE FROM ${schemas.ops}.rider_locations
        WHERE id IN (
          SELECT id FROM ${schemas.ops}.rider_locations
           WHERE recorded_at < now() - ($1 || ' days')::interval
           LIMIT ${CHUNK}
        )`,
      [String(RETENTION_DAYS)]
    );
    const n = res.rowCount ?? 0;
    deleted += n;
    if (n < CHUNK) break;
  }

  const left = await pool.query(`SELECT count(*)::int AS n FROM ${schemas.ops}.rider_locations`);
  return NextResponse.json({ ok: true, retention_days: RETENTION_DAYS, deleted, remaining: left.rows[0].n });
}
