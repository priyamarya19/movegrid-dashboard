import type { PoolClient } from "pg";
import { schemas } from "@/lib/schemas";

// The single money-movement primitive: convert a received amount into days on
// the rider's active assignment (rolling-balance model, banked-credit aware) and
// write the rider_payments ledger row. Used by BOTH the staff rent-received
// route and payment-claim approval — one implementation, one behaviour.
//
// Caller owns the transaction: run inside BEGIN/COMMIT on `client`.
export class NoActiveAssignmentError extends Error {
  constructor() {
    super("Rider has no active assignment with a daily rate set");
  }
}

export async function recordRentPayment(
  client: PoolClient,
  args: {
    riderId: string;
    amount: number;
    paymentMode: string;
    paymentUtr?: string | null;
    screenshotUrl?: string | null;
  }
): Promise<{ daysAdded: number; oldPaidThrough: string; newPaidThrough: string }> {
  const S = schemas.ops;

  const asgn = await client.query(
    `SELECT id, vehicle_id, daily_rent, rent_credit, to_char(COALESCE(paid_through_date, assigned_date - 1), 'YYYY-MM-DD') AS paid_through_date
     FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE`,
    [args.riderId]
  );
  const assignment = asgn.rows[0];
  if (!assignment || !assignment.daily_rent) throw new NoActiveAssignmentError();

  // Fold in any ₹ credit sitting on the assignment (sub-day remainder from a
  // fractional waiver, or a previous partial payment) so it isn't lost: the
  // combined total converts to days, and the new remainder is carried forward.
  const rate = Number(assignment.daily_rent);
  const total = args.amount + (Number(assignment.rent_credit) || 0);
  const daysToAdd = Math.floor(total / rate + 1e-9);
  const newCredit = Math.max(0, Math.round((total - daysToAdd * rate) * 100) / 100);
  const oldPaidThrough = assignment.paid_through_date;

  const updated = await client.query(
    `UPDATE ${S}.rider_vehicle_assignments
     SET paid_through_date = COALESCE(paid_through_date, assigned_date - 1) + $1::int,
         rent_credit = $2
     WHERE id = $3
     RETURNING to_char(paid_through_date, 'YYYY-MM-DD') AS new_paid_through_date`,
    [daysToAdd, newCredit, assignment.id]
  );
  const newPaidThrough = updated.rows[0].new_paid_through_date;

  await client.query(
    `INSERT INTO ${S}.rider_payments
      (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end, payment_screenshot_url, payment_mode, payment_utr)
     VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date, $4, $5, $6, $7, $8)`,
    [args.riderId, assignment.vehicle_id, args.amount, oldPaidThrough, newPaidThrough, args.screenshotUrl ?? null, args.paymentMode, args.paymentUtr ?? null]
  );

  return { daysAdded: daysToAdd, oldPaidThrough, newPaidThrough };
}
