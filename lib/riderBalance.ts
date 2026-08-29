import type { PoolClient } from "pg";
import { schemas } from "@/lib/schemas";

/**
 * Prepaid days a rider keeps when they hand a scooter back, and the 15-day
 * window they have to use them.
 *
 * Kept in one place because three routes touch it — the return (credits), the
 * allotment (spends), and the sweep (lapses) — and money that three routes can
 * each move is money three routes can each get wrong.
 */

/** Ops asked for a fortnight. Long enough for a repair, short enough to close. */
export const CARRY_FORWARD_WINDOW_DAYS = 15;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The most days a return can carry.
 *
 * Inclusive of the return day itself: a week paid through the 7th and handed
 * back on the 5th leaves the 5th, 6th and 7th unridden if the rider brought it
 * in that morning. Whether the 5th really was unused is ops' call — this is
 * the ceiling, not the answer.
 */
export function maxCarryForwardDays(paidThrough: string | null, returnedOn: string): number {
  if (!paidThrough) return 0;
  const diff = Math.round(
    (new Date(paidThrough + "T00:00:00Z").getTime() - new Date(returnedOn + "T00:00:00Z").getTime()) / 86400000
  );
  return Math.max(0, diff + 1);
}

/** The default we suggest: the day of return is assumed used. */
export function suggestedCarryForwardDays(paidThrough: string | null, returnedOn: string): number {
  return Math.max(0, maxCarryForwardDays(paidThrough, returnedOn) - 1);
}

/** When a balance credited on `returnedOn` stops being spendable. */
export function balanceExpiryDate(returnedOn: string): string {
  return addDays(returnedOn, CARRY_FORWARD_WINDOW_DAYS);
}

/**
 * Lapse a rider's balance if its window has closed, and write down that it
 * lapsed. Safe to call on every read — it does nothing when there is nothing
 * to expire.
 *
 * Runs on the caller's client so it commits with whatever else is happening.
 */
export async function expireBalanceIfLapsed(
  client: PoolClient,
  riderId: string,
  today: string,
  actor = "system"
): Promise<{ expired: boolean; amount: number; days: number }> {
  const res = await client.query(
    `SELECT COALESCE(balance,0)::numeric AS balance, COALESCE(balance_days,0)::int AS days,
            to_char(balance_expires_on,'YYYY-MM-DD') AS expires_on
       FROM ${schemas.ops}.riders WHERE id = $1 FOR UPDATE`,
    [riderId]
  );
  const r = res.rows[0];
  const amount = Number(r?.balance ?? 0);
  if (!r || amount <= 0 || !r.expires_on || r.expires_on >= today) {
    return { expired: false, amount: 0, days: 0 };
  }

  await client.query(
    `UPDATE ${schemas.ops}.riders SET balance = 0, balance_days = 0, balance_expires_on = NULL WHERE id = $1`,
    [riderId]
  );
  // The money was collected, so it cannot simply stop existing — it becomes a
  // dated line someone can be asked about.
  await client.query(
    `INSERT INTO ${schemas.ops}.rider_balance_entries
       (rider_id, delta, balance_after, days, kind, reason, created_by)
     VALUES ($1, $2, 0, $3, 'expired', $4, $5)`,
    [
      riderId, -amount, -Number(r.days),
      `Unused after ${CARRY_FORWARD_WINDOW_DAYS} days — window closed ${r.expires_on}`,
      actor,
    ]
  );
  return { expired: true, amount, days: Number(r.days) };
}
