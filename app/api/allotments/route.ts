import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json();
  if (!b.rider_id || !b.vehicle_id) {
    return NextResponse.json({ error: "Rider and vehicle are required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check vehicle is available
    const vCheck = await client.query(
      `SELECT id, status FROM ${schemas.ops}.vehicles WHERE id = $1`, [b.vehicle_id]
    );
    if (!vCheck.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    if (vCheck.rows[0].status === "assigned") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Vehicle is already assigned to another rider" }, { status: 409 });
    }
    // Only vehicles cleared by ops (Ready to Deploy) can be allotted.
    if (vCheck.rows[0].status !== "ready_to_deploy") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Vehicle must be 'Ready to Deploy' before it can be allotted. Set its status first." }, { status: 409 });
    }

    // Close any existing active assignment for this rider, and free its vehicle so it
    // doesn't get stuck 'assigned' with no rider (re-allotment / vehicle swap).
    const prev = await client.query(
      `SELECT vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active'`,
      [b.rider_id]
    );
    await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments SET status = 'returned', returned_date = CURRENT_DATE
       WHERE rider_id = $1 AND status = 'active'`,
      [b.rider_id]
    );
    for (const row of prev.rows) {
      if (row.vehicle_id !== b.vehicle_id) {
        await client.query(`UPDATE ${schemas.ops}.vehicles SET status = 'returned' WHERE id = $1`, [row.vehicle_id]);
      }
    }

    // Daily rent comes from the vehicle's model — the single source of truth for rent
    // math (rent_dues, paid_through_date). Falls back to ₹240/day if a model has none set.
    const rateRes = await client.query(
      `SELECT COALESCE(m.rental_per_day, 240) AS rate
       FROM ${schemas.ops}.vehicles v JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
       WHERE v.id = $1`,
      [b.vehicle_id]
    );
    const dailyRent = Number(rateRes.rows[0]?.rate ?? 240);
    const assignedDate = b.assigned_date || new Date().toISOString().split("T")[0];

    // Rent is always collected one week in advance at allotment (see RENT_SHEET_GUIDE.md).
    // Whatever cash amount ops records as "amount_collected" (rent + deposit + fees bundled
    // together) always covers at least week 1, so week 1 counts as paid — unless nothing was
    // collected at all, in which case don't fabricate a payment that didn't happen.
    const week1Paid = b.amount_collected != null && Number(b.amount_collected) > 0;

    // If the rider's vehicle was just swapped out due to a hardware fault (marked at
    // return time — see app/api/allotments/[id]/return), continue their existing rent
    // cycle from where it left off instead of starting a fresh week: they already paid
    // for days beyond the swap date. non_functional_days is NOT applied here — it sits
    // as a pending waiver request until someone with can_approve_rent_waivers approves
    // it (see the INSERT below), so the rider is shown owing full rent until then.
    // Marks the old row consumed immediately so this can never be matched again by a
    // later, unrelated allotment for the same rider.
    const priorSwap = await client.query(
      `SELECT id, to_char(paid_through_date,'YYYY-MM-DD') AS paid_through_date, non_functional_days
       FROM ${schemas.ops}.rider_vehicle_assignments
       WHERE rider_id = $1 AND status = 'returned' AND is_issue_swap = true
       ORDER BY returned_date DESC, created_at DESC LIMIT 1`,
      [b.rider_id]
    );
    const carryOver = priorSwap.rows[0];

    let paidThroughDateValue;
    if (carryOver) {
      const base = new Date(carryOver.paid_through_date + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() + (week1Paid ? 6 : 0));
      paidThroughDateValue = base.toISOString().slice(0, 10);
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments SET is_issue_swap = false WHERE id = $1`,
        [carryOver.id]
      );
    } else {
      const base = new Date(assignedDate + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() + (week1Paid ? 6 : -1));
      paidThroughDateValue = base.toISOString().slice(0, 10);
    }

    // Onboarding fee is charged once per continuous rental relationship, not on every
    // reallocation — but a gap of more than 15 days since the rider's last return resets
    // that: treated as a fresh onboarding, so OB applies again. A same-day issue-swap
    // (gap = 0) always falls well inside the window, so no special-casing needed here.
    const lastReturn = await client.query(
      `SELECT to_char(MAX(returned_date),'YYYY-MM-DD') AS last_returned
       FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'returned'`,
      [b.rider_id]
    );
    const lastReturned = lastReturn.rows[0]?.last_returned;
    const gapDays = lastReturned ? Math.round((new Date(assignedDate + "T00:00:00Z").getTime() - new Date(lastReturned + "T00:00:00Z").getTime()) / 86400000) : null;
    const obApplies = gapDays === null || gapDays > 15;
    const onboardingFeeValue = obApplies ? (b.onboarding_fee ?? null) : null;

    // Create new assignment
    const result = await client.query(`
      INSERT INTO ${schemas.ops}.rider_vehicle_assignments (
        rider_id, vehicle_id, hub_id, assigned_date, status,
        amount_collected, payment_screenshot_url, undertaking_url, allotment_pics, allotted_by,
        daily_rent, paid_through_date
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11)
      RETURNING id`,
      [
        b.rider_id, b.vehicle_id, b.hub_id ?? null, assignedDate,
        b.amount_collected ?? null, b.payment_screenshot_url ?? null,
        b.undertaking_url ?? null, b.allotment_pics ?? null, session.name,
        dailyRent, paidThroughDateValue,
      ]
    );

    // Record the week-1 prepaid advance so it shows up in the rider's payment history
    // (same convention as every past onboarding — one week's rent, not the raw cash figure).
    if (week1Paid) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
         VALUES ($1, $2, $3, $4::date + 6, $4, $4::date + 6)`,
        [b.rider_id, b.vehicle_id, dailyRent * 7, assignedDate]
      );
    }

    // Pending rent waiver: the non_functional_days credit from an issue-swap doesn't
    // apply immediately (see paidThroughDateValue above) — it waits here for approval.
    if (carryOver && Number(carryOver.non_functional_days) > 0) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, requested_by)
         VALUES ($1, $2, $3, $4)`,
        [b.rider_id, result.rows[0].id, Number(carryOver.non_functional_days), session.name]
      );
    }

    // Update rider: status → active, rental_mode, onboarding_fee, security_deposit
    await client.query(
      `UPDATE ${schemas.ops}.riders SET status = 'active', rental_mode = COALESCE($1, rental_mode),
       onboarding_fee = COALESCE($2, onboarding_fee), security_deposit = COALESCE($3, security_deposit)
       WHERE id = $4`,
      [b.rental_mode ?? null, onboardingFeeValue, b.security_deposit ?? null, b.rider_id]
    );

    // Update vehicle status → assigned
    await client.query(
      `UPDATE ${schemas.ops}.vehicles SET status = 'assigned', hub_id = COALESCE($1, hub_id) WHERE id = $2`,
      [b.hub_id ?? null, b.vehicle_id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
