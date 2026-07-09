import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// Investor updates their own bank details. The change is applied immediately but
// flagged bank_status='pending' until an admin verifies it.
export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["investor"]);
  if ("response" in guard) return guard.response;
  const { session } = guard;

  const body = await req.json();
  const bank = body.bank?.trim();
  const ifsc = body.ifsc?.trim()?.toUpperCase();
  const accountNumber = body.account_number?.trim();
  const confirmAccount = body.confirm_account_number?.trim();

  if (!bank || !accountNumber || !ifsc) {
    return NextResponse.json({ error: "Bank name, account number and IFSC are required" }, { status: 400 });
  }
  if (accountNumber !== confirmAccount) {
    return NextResponse.json({ error: "Account numbers do not match" }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE ${schemas.ops}.investor_profiles
       SET bank = $1, ifsc = $2, account_number = $3, bank_status = 'pending'
     WHERE user_id = $4
     RETURNING id`,
    [bank, ifsc, accountNumber, session.userId]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Investor profile not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, bank_status: "pending" });
}
