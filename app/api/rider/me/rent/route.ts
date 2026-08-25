import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";
import { getRiderCycle, nextDueSql, outstandingSql } from "@/lib/rent";

// GET /api/rider/me/rent — everything the rider's My Rent + Ledger screens need,
// computed by the SAME shared formulas the dashboard and ops app use. The rider
// must never see a different number than the team.
export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const S = schemas.ops;

  const [weeks, asgn, payments] = await Promise.all([
    getRiderCycle(riderId),
    pool.query(
      `SELECT a.daily_rent, COALESCE(a.rent_credit, 0) AS rent_credit,
         to_char(COALESCE(a.paid_through_date, a.assigned_date), 'YYYY-MM-DD') AS paid_through_date,
         to_char(${nextDueSql("a")}, 'YYYY-MM-DD') AS next_due_date,
         ${outstandingSql("a")} AS outstanding_now
       FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id = $1 AND a.status = 'active' LIMIT 1`,
      [riderId]
    ),
    pool.query(
      `SELECT rp.amount_collected, rp.payment_mode,
         to_char(rp.payment_date, 'YYYY-MM-DD') AS payment_date,
         to_char(rp.rental_period_start, 'YYYY-MM-DD') AS period_start,
         to_char(rp.rental_period_end, 'YYYY-MM-DD') AS period_end
       FROM ${S}.rider_payments rp WHERE rp.rider_id = $1
       ORDER BY rp.payment_date DESC, rp.created_at DESC LIMIT 100`,
      [riderId]
    ),
  ]);

  const a = asgn.rows[0];
  return NextResponse.json({
    has_active_assignment: !!a,
    daily_rent: a ? Number(a.daily_rent) : null,
    rent_credit: a ? Math.round(Number(a.rent_credit)) : 0,
    paid_through_date: a?.paid_through_date ?? null,
    next_due_date: a?.next_due_date ?? null,
    outstanding_now: a ? Math.round(Number(a.outstanding_now)) : 0,
    weeks,
    payments: payments.rows.map((p) => ({
      amount: Math.round(Number(p.amount_collected)),
      mode: p.payment_mode,
      date: p.payment_date,
      period_start: p.period_start,
      period_end: p.period_end,
    })),
    total_paid: payments.rows.reduce((s, p) => s + Number(p.amount_collected), 0),
  });
}
