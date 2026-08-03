import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// GET /api/bad-debts — the register: every debt with what's been recovered
// since and what remains, plus header totals. Settled entries (remaining 0)
// stay listed for history.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const S = schemas.ops;

  const res = await pool.query(`
    SELECT d.id, d.source, d.original_outstanding::int AS original,
      d.collected_at_close::int AS collected_at_close,
      to_char(d.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
      d.created_by,
      COALESCE((SELECT SUM(p.amount) FROM ${S}.bad_debt_payments p WHERE p.bad_debt_id = d.id), 0)::int AS recovered_later,
      r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
      v.id AS vehicle_id, v.ev_number
    FROM ${S}.bad_debts d
    JOIN ${S}.riders r ON r.id = d.rider_id
    LEFT JOIN ${S}.vehicles v ON v.id = d.vehicle_id
    ORDER BY d.created_at DESC`);

  const rows = res.rows.map((d) => ({ ...d, remaining: Math.max(0, Number(d.original) - Number(d.recovered_later)) }));
  return NextResponse.json({
    debts: rows,
    totals: {
      gross: rows.reduce((s, d) => s + Number(d.original), 0),
      recovered: rows.reduce((s, d) => s + Number(d.recovered_later), 0),
      outstanding: rows.reduce((s, d) => s + d.remaining, 0),
    },
  });
}
