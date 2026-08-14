import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { IST, OVERDUE_CUTOFF, outstandingSql } from "@/lib/rent";
import { pushToRider } from "@/lib/riderPush";

// Rent reminders — the two scheduled push events.
//
//   rent_due_tomorrow : paid through today, so tomorrow starts an unpaid week.
//   rent_overdue      : past the T+2 grace, i.e. genuinely behind.
//
// Called by cron (same X-Cron-Secret as the report emails). Runs once a day;
// deliberately NOT on a loop, because a rider who is weeks behind should get one
// nudge a day, not one per overdue week.
//
// Deliberately quiet hours: this is scheduled for the morning, never at night.

export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const S = schemas.ops;

  // Due tomorrow: paid through exactly today.
  const dueTomorrow = await pool.query(`
    SELECT a.rider_id, (a.daily_rent * 7)::int AS amount
    FROM ${S}.rider_vehicle_assignments a
    WHERE a.status = 'active'
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) = ${IST}`);

  // Overdue: past the two-day grace. Amount is the whole-week-rounded figure the
  // rider sees everywhere else, so the number in the notification matches the app.
  const overdue = await pool.query(`
    SELECT a.rider_id, ${outstandingSql("a")}::int AS amount
    FROM ${S}.rider_vehicle_assignments a
    WHERE a.status = 'active'
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) < ${OVERDUE_CUTOFF}`);

  let sentDue = 0;
  for (const r of dueTomorrow.rows) {
    sentDue += (await pushToRider(r.rider_id, "rent_due_tomorrow", { amount: r.amount })) > 0 ? 1 : 0;
  }

  let sentOverdue = 0;
  for (const r of overdue.rows) {
    if (Number(r.amount) <= 0) continue;
    sentOverdue += (await pushToRider(r.rider_id, "rent_overdue", { amount: r.amount })) > 0 ? 1 : 0;
  }

  return NextResponse.json({
    ok: true,
    due_tomorrow: { matched: dueTomorrow.rowCount ?? 0, notified: sentDue },
    overdue: { matched: overdue.rowCount ?? 0, notified: sentOverdue },
  });
}
