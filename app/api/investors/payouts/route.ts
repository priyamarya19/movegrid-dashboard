import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

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
