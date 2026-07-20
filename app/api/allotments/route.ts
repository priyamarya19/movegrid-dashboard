import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession, userCanViewAllotments } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { IST } from "@/lib/rent";
import { rangeCondition } from "@/lib/dateRange";
import { writeAudit } from "@/lib/audit";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";

// GET /api/allotments — active allotments for the permissioned Allotments list,
// optionally filtered by allotment date (?range=today|yesterday|last7|mtd, or
// ?from=&to=). Gated by the can_view_allotments permission.
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  if (!(await userCanViewAllotments(guard.session.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateWhere = rangeCondition("a.assigned_date", searchParams.get("range"), searchParams.get("from"), searchParams.get("to"));
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, v.id AS vehicle_id, v.ev_number,
      to_char(a.assigned_date, 'YYYY-MM-DD') AS assigned_date,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 1, 'YYYY-MM-DD') AS week_start,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 7, 'YYYY-MM-DD') AS week_end,
      a.allotted_by,
      (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1))::int AS days_behind
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    WHERE a.status = 'active' AND ${dateWhere}
    ORDER BY a.assigned_date DESC`);
  return NextResponse.json({ allotments: res.rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json();
  if (!b.rider_id || !b.vehicle_id) {
    return NextResponse.json({ error: "Rider and vehicle are required" }, { status: 400 });
  }

  // A retried allotment (mobile outbox replaying a network-dropped submit) returns
  // the original result instead of a confusing "already assigned" 409.
  const idem = await beginIdempotency(req, "allotment-create", session.userId);
  if (idem.mode === "replay") return idem.response;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check vehicle is available. FOR UPDATE locks the vehicle row for the length
    // of this transaction so two allotments submitted at the same instant can't
    // both read 'ready_to_deploy' and double-assign one vehicle to two riders. The
    // partial unique index (scripts/add-active-assignment-guard.js) is the DB-level
    // backstop if this check is ever bypassed.
    const vCheck = await client.query(
      `SELECT id, status FROM ${schemas.ops}.vehicles WHERE id = $1 FOR UPDATE`, [b.vehicle_id]
    );
    if (!vCheck.rows[0]) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    if (vCheck.rows[0].status === "assigned") {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: "Vehicle is already assigned to another rider" }, { status: 409 });
    }
    // Only vehicles cleared by ops (Ready to Deploy) can be allotted.
    if (vCheck.rows[0].status !== "ready_to_deploy") {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: "Vehicle must be 'Ready to Deploy' before it can be allotted. Set its status first." }, { status: 409 });
    }

    // Close any existing active assignment for this rider, and free its vehicle so it
    // doesn't get stuck 'assigned' with no rider (re-allotment / vehicle swap).
    const prev = await client.query(
      `SELECT vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active'`,
      [b.rider_id]
    );
    await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments SET status = 'returned', returned_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
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
    // Daily rate is set per-allotment: use the rate ops entered on the form (it can
    // vary by the km/usage deal), falling back to the vehicle model's default rate.
    const formRate = b.daily_rent != null && b.daily_rent !== "" ? Number(b.daily_rent) : null;
    const dailyRent = formRate != null && !Number.isNaN(formRate) && formRate > 0
      ? formRate
      : Number(rateRes.rows[0]?.rate ?? 240);
    const assignedDate = b.assigned_date || istTodayISO();

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
      `SELECT id, to_char(paid_through_date,'YYYY-MM-DD') AS paid_through_date, non_functional_days, allotment_code
       FROM ${schemas.ops}.rider_vehicle_assignments
       WHERE rider_id = $1 AND status = 'returned' AND is_issue_swap = true
       ORDER BY returned_date DESC, created_at DESC LIMIT 1`,
      [b.rider_id]
    );
    const carryOver = priorSwap.rows[0];

    let paidThroughDateValue;
    if (carryOver) {
      // Base is the carried paid-through (the last ALREADY-PAID day), so a full prepaid
      // week must add 7 to keep paid-through in step with the ₹week payment we record
      // below. (The fresh branch adds 6 because ITS base is the first day of the period,
      // not the day before it — +6 there and +7 here both mean "one 7-day week".)
      const base = new Date(carryOver.paid_through_date + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() + (week1Paid ? 7 : 0));
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

    // Allotment ID: an issue-swap continuation stays inside the same tenancy, so it
    // inherits the swapped-out assignment's allotment_code (one sheet row = one code,
    // even across a vehicle change). A genuine new allotment takes the next code in
    // the sequence — same numbering the ops rent sheet uses.
    const allotmentCode = carryOver?.allotment_code
      ? carryOver.allotment_code
      : (await client.query(`SELECT 'MG' || LPAD(NEXTVAL('${schemas.ops}.allotment_code_seq')::TEXT, 6, '0') AS code`)).rows[0].code;

    // Create new assignment. continues_from_assignment_id is a permanent link (unlike
    // is_issue_swap, which gets reset once consumed above) — the rent ledger regenerator
    // uses it to keep week numbers continuous across the vehicle change (Week 4, 5... not
    // a fresh Week 1) even though the physical vehicle and its own assigned_date changed.
    const result = await client.query(`
      INSERT INTO ${schemas.ops}.rider_vehicle_assignments (
        rider_id, vehicle_id, hub_id, assigned_date, status,
        amount_collected, payment_screenshot_url, undertaking_url, allotment_pics, allotted_by,
        daily_rent, paid_through_date, continues_from_assignment_id, allotment_code
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, allotment_code`,
      [
        b.rider_id, b.vehicle_id, b.hub_id ?? null, assignedDate,
        b.amount_collected ?? null, b.payment_screenshot_url ?? null,
        b.undertaking_url ?? null, b.allotment_pics ?? null, session.name,
        dailyRent, paidThroughDateValue, carryOver ? carryOver.id : null, allotmentCode,
      ]
    );

    // Record the week-1 prepaid advance so it shows up in the rider's payment history
    // (one week's rent, not the raw cash figure). payment_date is the day the money
    // was actually received — today — not the period end, which put future dates in
    // the Payments Received list for freshly onboarded riders.
    if (week1Paid) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
         VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date, $4, $4::date + 6)`,
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
      `UPDATE ${schemas.ops}.riders SET status = 'active',
       rental_mode = COALESCE($1, rental_mode), rider_mode = COALESCE($2, rider_mode),
       onboarding_fee = COALESCE($3, onboarding_fee), security_deposit = COALESCE($4, security_deposit)
       WHERE id = $5`,
      [b.rental_mode ?? null, b.rider_mode ?? null, onboardingFeeValue, b.security_deposit ?? null, b.rider_id]
    );

    // Update vehicle status → assigned
    await client.query(
      `UPDATE ${schemas.ops}.vehicles SET status = 'assigned', hub_id = COALESCE($1, hub_id) WHERE id = $2`,
      [b.hub_id ?? null, b.vehicle_id]
    );

    await client.query("COMMIT");
    await writeAudit({
      action: "allotment_created", entity: "assignment", entityId: result.rows[0].id,
      actorId: session.userId, actorName: session.name, req,
      details: { rider_id: b.rider_id, vehicle_id: b.vehicle_id, allotment_code: result.rows[0].allotment_code, amount_collected: b.amount_collected ?? null },
    });
    const respBody = { id: result.rows[0].id, allotment_code: result.rows[0].allotment_code };
    if (idem.mode === "claimed") await finishIdempotency(idem, 201, respBody);
    return NextResponse.json(respBody, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    if (idem.mode === "claimed") await abortIdempotency(idem);
    throw e;
  } finally {
    client.release();
  }
}
