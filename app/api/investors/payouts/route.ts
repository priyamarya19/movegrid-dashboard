import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

// Record a payout already made to an investor (for a given month, with a receipt).
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const investorId = body.investor_id;
  const month = body.period_month; // "YYYY-MM" or "YYYY-MM-DD"
  const amount = body.amount != null ? Number(body.amount) : NaN;
  const paidDate = body.paid_date || null;
  const vehicleId = body.vehicle_id || null;
  const proofUrl = body.proof_url?.trim() || null;
  const note = body.note?.trim() || null;

  if (!investorId || !month) {
    return NextResponse.json({ error: "Investor and month are required" }, { status: 400 });
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }
  if (!proofUrl) {
    return NextResponse.json({ error: "Payment proof is required" }, { status: 400 });
  }

  // Normalise the month to the first of that month.
  const periodMonth = month.length === 7 ? `${month}-01` : month;

  const inv = await pool.query(
    `SELECT id FROM ${schemas.ops}.investor_profiles WHERE id = $1`,
    [investorId]
  );
  if (!inv.rows[0]) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  const result = await pool.query(
    `INSERT INTO ${schemas.ops}.investor_payouts
       (investor_id, vehicle_id, amount, due_date, paid_date, status, period_month, proof_url, note)
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), 'paid', $4, $6, $7)
     RETURNING id`,
    [investorId, vehicleId, amount, periodMonth, paidDate, proofUrl, note]
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { payout_id } = await req.json();
  if (!payout_id) return NextResponse.json({ error: "payout_id required" }, { status: 400 });

  const result = await pool.query(
    `UPDATE ${schemas.ops}.investor_payouts
     SET status = 'paid', paid_date = CURRENT_DATE
     WHERE id = $1 AND status = 'pending'
     RETURNING id, amount, paid_date`,
    [payout_id]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Payout not found or already paid" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}
