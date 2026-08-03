import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  // Vehicles and payouts are aggregated in separate subqueries — joining both
  // onto the profile row multiplies them (42 vehicles × 1 payout inflated
  // total_paid 42×, and a 2nd payout would have doubled the vehicle count).
  const result = await pool.query(`
    SELECT ip.id, u.name, u.email, u.mobile,
           ip.total_invested, ip.investment_date, ip.status,
           ip.bank, ip.account_number, ip.ifsc, ip.bank_status,
           ip.payout_start_date, ip.payout_term_months, ip.roi_percent, ip.scooter_price,
           (SELECT COUNT(*) FROM ${schemas.ops}.vehicles v WHERE v.investor_id = ip.id) AS vehicle_count,
           COALESCE((SELECT SUM(pay.amount) FROM ${schemas.ops}.investor_payouts pay
                     WHERE pay.investor_id = ip.id AND pay.status = 'paid'), 0) AS total_paid,
           -- Instalments = distinct months with a paid payout (two entries in one
           -- month count once).
           (SELECT COUNT(DISTINCT date_trunc('month', COALESCE(pay.period_month, pay.due_date)))
            FROM ${schemas.ops}.investor_payouts pay
            WHERE pay.investor_id = ip.id AND pay.status = 'paid') AS instalments_paid
    FROM ${schemas.ops}.investor_profiles ip
    JOIN ${schemas.auth}.users u ON u.id = ip.user_id
    ORDER BY ip.total_invested DESC
  `);

  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const body = await req.json();
  const name = body.name?.trim();
  const email = body.email?.toLowerCase().trim();
  const mobile = body.mobile?.trim();
  const password = body.password;
  const aadhaar = body.aadhaar?.trim() || null;
  const aadhaarUrl = body.aadhaar_url?.trim() || null;
  const pan = body.pan?.trim() || null;
  const bank = body.bank?.trim() || null;
  const ifsc = body.ifsc?.trim()?.toUpperCase() || null;
  const accountNumber = body.account_number?.trim() || null;
  const confirmAccount = body.confirm_account_number?.trim() || null;
  const totalInvested = body.total_invested != null ? Number(body.total_invested) : null;
  const investmentDate = body.investment_date || null;
  // Deal terms (migration 020): when earning starts, instalment count, ROI, per-scooter price.
  const payoutStartDate = body.payout_start_date || null;
  const payoutTermMonths = body.payout_term_months != null && body.payout_term_months !== "" ? Number(body.payout_term_months) : 24;
  const roiPercent = body.roi_percent != null && body.roi_percent !== "" ? Number(body.roi_percent) : null;
  const scooterPrice = body.scooter_price != null && body.scooter_price !== "" ? Number(body.scooter_price) : null;
  if (!Number.isInteger(payoutTermMonths) || payoutTermMonths < 1 || payoutTermMonths > 120) {
    return NextResponse.json({ error: "Instalment term must be between 1 and 120 months" }, { status: 400 });
  }

  if (!name || !email || !mobile || !password) {
    return NextResponse.json({ error: "Name, email, mobile and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (totalInvested == null || Number.isNaN(totalInvested) || totalInvested < 0) {
    return NextResponse.json({ error: "A valid investment amount is required" }, { status: 400 });
  }
  if (!bank || !accountNumber || !ifsc) {
    return NextResponse.json({ error: "Bank name, account number and IFSC are required" }, { status: 400 });
  }
  if (accountNumber !== confirmAccount) {
    return NextResponse.json({ error: "Account numbers do not match" }, { status: 400 });
  }

  const roleResult = await pool.query(
    `SELECT id FROM ${schemas.auth}.roles WHERE name = 'investor'`
  );
  if (!roleResult.rows[0]) {
    return NextResponse.json({ error: "Investor role not configured" }, { status: 500 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO ${schemas.auth}.users (name, email, mobile, password_hash, role_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [name, email, mobile, passwordHash, roleResult.rows[0].id]
    );
    const userId = userResult.rows[0].id;

    const profileResult = await client.query(
      `INSERT INTO ${schemas.ops}.investor_profiles
         (user_id, pan, aadhaar, aadhaar_url, bank, ifsc, account_number, total_invested, investment_date, status, bank_status,
          payout_start_date, payout_term_months, roi_percent, scooter_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'verified', $10, $11, $12, $13)
       RETURNING id`,
      [userId, pan, aadhaar, aadhaarUrl, bank, ifsc, accountNumber, totalInvested, investmentDate,
       payoutStartDate, payoutTermMonths, roiPercent, scooterPrice]
    );

    await client.query("COMMIT");
    return NextResponse.json({ id: profileResult.rows[0].id }, { status: 201 });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const e = err as { code?: string; constraint?: string };
    if (e.code === "23505") {
      if (e.constraint?.includes("aadhaar")) {
        return NextResponse.json({ error: "Aadhaar already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Email or mobile already exists" }, { status: 409 });
    }
    throw err;
  } finally {
    client.release();
  }
}
