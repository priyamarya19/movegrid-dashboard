import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";
import { writeAudit } from "@/lib/audit";

// POST /api/rider/me/payment-claims — the rider claims "I paid this much, here's
// the proof". Claims NEVER touch the ledger; ops approval does (verification
// queue). Reminder logic treats a pending claim as "don't chase".
export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const S = schemas.ops;

  const { amount, utr, screenshot_key } = await req.json();
  const amountNum = Number(amount);
  if (!(amountNum > 0)) return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  if (amountNum > 100000) return NextResponse.json({ error: "Amount looks too large — check and retry" }, { status: 400 });
  if (!screenshot_key || typeof screenshot_key !== "string") {
    return NextResponse.json({ error: "Payment screenshot is required" }, { status: 400 });
  }

  // At most 3 claims can sit unreviewed per rider — protects the queue from
  // accidental duplicate submissions.
  const pending = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${S}.payment_claims WHERE rider_id = $1 AND status = 'pending'`,
    [riderId]
  );
  if (pending.rows[0].n >= 3) {
    return NextResponse.json({ error: "Aapke 3 payments already review mein hain — unke verify hone ka intezaar karein" }, { status: 429 });
  }

  // Same UTR already claimed or recorded → likely a duplicate submission.
  const trimmedUtr = utr ? String(utr).trim() : null;
  if (trimmedUtr) {
    const dup = await pool.query(
      `SELECT 1 FROM ${S}.payment_claims WHERE utr = $1 AND status IN ('pending','approved')
       UNION ALL
       SELECT 1 FROM ${S}.rider_payments WHERE payment_utr = $1 LIMIT 1`,
      [trimmedUtr]
    );
    if (dup.rows[0]) return NextResponse.json({ error: "Is UTR ka payment pehle se submit ho chuka hai" }, { status: 409 });
  }

  const res = await pool.query(
    `INSERT INTO ${S}.payment_claims (rider_id, amount, utr, screenshot_url)
     VALUES ($1, $2, $3, $4)
     RETURNING id, to_char(created_at, 'YYYY-MM-DD') AS created`,
    [riderId, amountNum, trimmedUtr, screenshot_key]
  );
  await writeAudit({
    action: "payment_claim_submitted", entity: "rider", entityId: riderId,
    actorId: riderId, actorName: guard.rider.name, req,
    details: { claim_id: res.rows[0].id, amount: amountNum, utr: trimmedUtr },
  });
  return NextResponse.json({ ok: true, claim_id: res.rows[0].id });
}

// GET /api/rider/me/payment-claims — the rider's own claims, newest first, so
// the app can show "Under review" / "Rejected: reason" states in the ledger.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT id, amount::int AS amount, utr, status, reject_reason,
       to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
     FROM ${schemas.ops}.payment_claims
     WHERE rider_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [guard.rider.riderId]
  );
  return NextResponse.json({ claims: res.rows });
}
