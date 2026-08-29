import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { istTodayISO } from "@/lib/date";
import { expireBalanceIfLapsed } from "@/lib/riderBalance";

/**
 * POST /api/rider-balances/expire — the nightly sweep.
 *
 * The allotment route already lapses a balance the moment the rider comes back
 * too late. This is for the rider who never comes back at all: without it their
 * balance sits on the books forever, and "expired" would only ever mean "the
 * ones we happened to notice".
 *
 * Same cron secret as the report jobs. Safe to run repeatedly — a balance can
 * only lapse once.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = istTodayISO();
  const due = await pool.query(
    `SELECT id, name FROM ${schemas.ops}.riders
      WHERE balance > 0 AND balance_expires_on IS NOT NULL AND balance_expires_on < $1::date
      ORDER BY balance_expires_on`,
    [today]
  );

  const expired: { rider: string; amount: number; days: number }[] = [];
  for (const r of due.rows) {
    // One transaction per rider: a single problem row must not hold up the rest.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await expireBalanceIfLapsed(client, r.id, today, "nightly sweep");
      await client.query("COMMIT");
      if (res.expired) expired.push({ rider: r.name, amount: res.amount, days: res.days });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("balance expiry failed for", r.id, e);
    } finally {
      client.release();
    }
  }

  return NextResponse.json({
    ok: true,
    checked: due.rows.length,
    expired: expired.length,
    total: Math.round(expired.reduce((a, e) => a + e.amount, 0) * 100) / 100,
    detail: expired,
  });
}
