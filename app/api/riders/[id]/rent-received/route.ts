import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession } from "@/lib/auth";
import { PAYMENT_MODES } from "@/lib/rent";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";
import { writeAudit } from "@/lib/audit";
import { recordRentPayment, NoActiveAssignmentError } from "@/lib/recordRentPayment";

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

    // Shared money-movement primitive (also used by payment-claim approval) —
    // credit-aware day conversion + the rider_payments ledger row.
    let result;
    try {
      result = await recordRentPayment(client, {
        riderId: id, amount: amountNum, paymentMode: payment_mode,
        paymentUtr: payment_utr ?? null, screenshotUrl: payment_screenshot_url,
      });
    } catch (e) {
      if (e instanceof NoActiveAssignmentError) {
        await client.query("ROLLBACK");
        if (idem.mode === "claimed") await abortIdempotency(idem);
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }

    await client.query("COMMIT");
    await writeAudit({
      action: "rent_received", entity: "rider", entityId: id,
      actorId: guard.session.userId, actorName: guard.session.name, req,
      details: { amount: amountNum, payment_mode, days_added: result.daysAdded, paid_through_date: result.newPaidThrough },
    });
    const respBody = { ok: true, paid_through_date: result.newPaidThrough, days_added: result.daysAdded };
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
    `SELECT (COALESCE(paid_through_date, assigned_date) >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS received
     FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [id]
  );

  // No active assignment → nothing outstanding.
  if (!res.rows[0]) return NextResponse.json({ received: false });
  return NextResponse.json({ received: res.rows[0].received });
}
