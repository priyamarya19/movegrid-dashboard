import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { recordRentPayment, NoActiveAssignmentError } from "@/lib/recordRentPayment";

// PATCH /api/payment-claims/[id] { action: 'approve' | 'reject', reason? }
// Approve runs the SAME rent-received primitive the staff flow uses (credit
// folding, ledger row, UTR carried) inside one transaction with the claim
// status change — so a claim can never be double-applied. Reject requires a
// reason, which the rider sees in their app.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  const { action, reason } = await req.json();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (action === "reject" && (!reason || !String(reason).trim())) {
    return NextResponse.json({ error: "A reason is required when rejecting" }, { status: 400 });
  }

  const S = schemas.ops;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const claim = await client.query(
      `SELECT id, rider_id, amount, utr, screenshot_url FROM ${S}.payment_claims
       WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id]
    );
    if (!claim.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Claim not found or already reviewed" }, { status: 404 });
    }
    const c = claim.rows[0];

    let paymentResult = null;
    if (action === "approve") {
      try {
        paymentResult = await recordRentPayment(client, {
          riderId: c.rider_id, amount: Number(c.amount), paymentMode: "Online",
          paymentUtr: c.utr, screenshotUrl: c.screenshot_url,
        });
      } catch (e) {
        if (e instanceof NoActiveAssignmentError) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: e.message }, { status: 409 });
        }
        throw e;
      }
    }

    await client.query(
      `UPDATE ${S}.payment_claims
       SET status = $1, reject_reason = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = $4`,
      [action === "approve" ? "approved" : "rejected", action === "reject" ? String(reason).trim() : null, session.name, id]
    );

    await client.query("COMMIT");
    await writeAudit({
      action: action === "approve" ? "payment_claim_approved" : "payment_claim_rejected",
      entity: "rider", entityId: c.rider_id,
      actorId: session.userId, actorName: session.name, req,
      details: {
        claim_id: id, amount: Number(c.amount), utr: c.utr,
        ...(paymentResult ? { days_added: paymentResult.daysAdded, paid_through_date: paymentResult.newPaidThrough } : { reason: String(reason ?? "").trim() }),
      },
    });
    return NextResponse.json({ ok: true, ...(paymentResult ? { paid_through_date: paymentResult.newPaidThrough } : {}) });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
