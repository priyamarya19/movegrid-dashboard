import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await pool.query(`
    SELECT ip.id, u.name, u.email, u.mobile,
           ip.total_invested, ip.investment_date, ip.status,
           COUNT(v.id) AS vehicle_count,
           COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount END), 0) AS total_paid,
           COALESCE(SUM(CASE WHEN pay.status = 'pending' THEN pay.amount END), 0) AS pending_amount
    FROM ${schemas.ops}.investor_profiles ip
    JOIN ${schemas.auth}.users u ON u.id = ip.user_id
    LEFT JOIN ${schemas.ops}.vehicles v ON v.investor_id = ip.id
    LEFT JOIN ${schemas.ops}.investor_payouts pay ON pay.investor_id = ip.id
    GROUP BY ip.id, u.name, u.email, u.mobile, ip.total_invested, ip.investment_date, ip.status
    ORDER BY ip.total_invested DESC
  `);

  return NextResponse.json(result.rows);
}
