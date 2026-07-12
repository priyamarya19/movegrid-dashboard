import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession } from "@/lib/auth";
import { PAYMENT_MODES } from "@/lib/rent";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";
import { writeAudit } from "@/lib/audit";

// Record a rent payment of any amount. Rolling-balance model: the amount converts to
// (amount / daily_rate) days and extends the rider's paid_through_date on their active
// assignment — no need to tie it to a specific week. This is what makes a normal
// on-time payment, a partial payment, and a multi-week advance top-up all "just work"
// through the same one action, whether entered here, in the overdue list, or due-soon list.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const { amount, payment_screenshot_url, payment_mode, payment_utr } = await req.json();

  // Proof is mandatory (screenshot for online, photo of cash for cash).
  if (!payment_mode || !payment_screenshot_url) {
    return NextResponse.json({ error: "Payment mode and a proof image are required" }, { status: 400 });
  }

  // payment_mode must be one of the canonical values the app sends.
  if (!PAYMENT_MODES.includes(payment_mode)) {
    return NextResponse.json({ error: "Payment mode must be one of: Cash, Online, Cash + Online" }, { status: 400 });
  }

  // A real amount is required. Previously a missing amount fell back to 0, writing
  // a phantom ₹0 payment row that could mark a week as "paid" for zero rupees.
  const amountNum = Number(amount);
  if (amount == null || amount === "" || Number.isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: "A valid payment amount is required" }, { status: 400 });
  }

  // Dedupe a timed-out-then-retried submission from the app (same Idempotency-Key)
  // so it can't record the same payment twice. No header → behaves as before.
  const idem = await beginIdempotency(req, "rent-received", guard.session.userId);
  if (idem.mode === "replay") return idem.response;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const asgn = await client.query(
      `SELECT id, vehicle_id, daily_rent, to_char(COALESCE(paid_through_date, assigned_date - 1), 'YYYY-MM-DD') AS paid_through_date
       FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE`,
      [id]
    );
    const assignment = asgn.rows[0];
    if (!assignment || !assignment.daily_rent) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: "Rider has no active assignment with a daily rate set" }, { status: 409 });
    }

    const daysToAdd = Math.floor(amountNum / Number(assignment.daily_rent));
    const oldPaidThrough = assignment.paid_through_date;

    const updated = await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments
       SET paid_through_date = COALESCE(paid_through_date, assigned_date - 1) + $1::int
       WHERE id = $2
       RETURNING to_char(paid_through_date, 'YYYY-MM-DD') AS new_paid_through_date`,
      [daysToAdd, assignment.id]
    );
    const newPaidThrough = updated.rows[0].new_paid_through_date;

    // recorded_by_employee_id FKs to employee_profiles, which nothing populates today —
    // looking up the session user in auth.users (a different table) would violate that FK
    // for any real user. Left null, matching every existing rider_payments row.
    await client.query(
      `INSERT INTO ${schemas.ops}.rider_payments
        (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end, payment_screenshot_url, payment_mode, payment_utr)
       VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date, $4, $5, $6, $7, $8)`,
      [id, assignment.vehicle_id, amountNum, oldPaidThrough, newPaidThrough, payment_screenshot_url, payment_mode, payment_utr ?? null]
    );

    await client.query("COMMIT");
    await writeAudit({
      action: "rent_received", entity: "rider", entityId: id,
      actorId: guard.session.userId, actorName: guard.session.name, req,
      details: { amount: amountNum, payment_mode, days_added: daysToAdd, paid_through_date: newPaidThrough },
    });
    const respBody = { ok: true, paid_through_date: newPaidThrough, days_added: daysToAdd };
    if (idem.mode === "claimed") await finishIdempotency(idem, 200, respBody);
    return NextResponse.json(respBody);
  } catch (e) {
    await client.query("ROLLBACK");
    if (idem.mode === "claimed") await abortIdempotency(idem);
    throw e;
  } finally {
    client.release();
  }
}

// Check if the rider is currently paid up (rolling balance): received = their
// paid_through_date is today or later, on their active assignment.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const S = schemas.ops;

  const res = await pool.query(
    `SELECT (COALESCE(paid_through_date, assigned_date - 1) >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS received
     FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [id]
  );

  // No active assignment → nothing outstanding.
  if (!res.rows[0]) return NextResponse.json({ received: false });
  return NextResponse.json({ received: res.rows[0].received });
}
