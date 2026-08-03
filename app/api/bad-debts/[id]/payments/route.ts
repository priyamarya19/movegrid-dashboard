import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { PAYMENT_MODES } from "@/lib/rent";

// POST /api/bad-debts/[id]/payments — a defaulter pays after their tenancy
// closed. Amount + mode + proof required (same discipline as live payments);
// capped at the remaining balance so a debt can't go negative.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  const b = await req.json();
  const S = schemas.ops;

  const amount = Number(b.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  if (!PAYMENT_MODES.includes(b.payment_mode)) {
    return NextResponse.json({ error: "Payment mode must be one of: Cash, Online, Cash + Online" }, { status: 400 });
  }
  if (!b.proof_url) return NextResponse.json({ error: "Payment proof is required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const debt = await client.query(
      `SELECT d.id, d.rider_id, d.original_outstanding::int AS original,
         COALESCE((SELECT SUM(p.amount) FROM ${S}.bad_debt_payments p WHERE p.bad_debt_id = d.id), 0)::int AS recovered
       FROM ${S}.bad_debts d WHERE d.id = $1 FOR UPDATE`,
      [id]
    );
    if (!debt.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Bad-debt entry not found" }, { status: 404 });
    }
    const remaining = Number(debt.rows[0].original) - Number(debt.rows[0].recovered);
    if (amount > remaining) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Amount exceeds the remaining balance (₹${remaining.toLocaleString("en-IN")})` }, { status: 400 });
    }

    await client.query(
      `INSERT INTO ${S}.bad_debt_payments (bad_debt_id, amount, payment_mode, payment_utr, proof_url, note, received_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, amount, b.payment_mode, b.payment_utr ?? null, b.proof_url, b.note ?? null, session.name]
    );
    await client.query("COMMIT");
    await writeAudit({
      action: "bad_debt_payment", entity: "rider", entityId: debt.rows[0].rider_id,
      actorId: session.userId, actorName: session.name, req,
      details: { bad_debt_id: id, amount, remaining_after: remaining - amount },
    });
    return NextResponse.json({ ok: true, remaining: remaining - amount });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
