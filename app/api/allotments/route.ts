import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession, userCanViewAllotments } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { IST } from "@/lib/rent";
import { rangeCondition } from "@/lib/dateRange";
import { writeAudit } from "@/lib/audit";
import { highSpeedDocsMissing } from "@/lib/highSpeedGate";
import { getHubScope, hubScopeSql, scopeAllowsHub } from "@/lib/hubScope";
import { pushToRiderAsync } from "@/lib/riderPush";
import { logVehicleStatus } from "@/lib/vehicleStatusLog";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";
import { defaultRentStart } from "@/lib/rentStart";
import { consumeApproval, fingerprint } from "@/lib/approvals";

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
      to_char(COALESCE(a.paid_through_date, a.assigned_date) + 1, 'YYYY-MM-DD') AS week_start,
      to_char(COALESCE(a.paid_through_date, a.assigned_date) + 7, 'YYYY-MM-DD') AS week_end,
      a.allotted_by,
      (${IST} - COALESCE(a.paid_through_date, a.assigned_date))::int AS days_behind
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
      `SELECT id, status, hub_id FROM ${schemas.ops}.vehicles WHERE id = $1 FOR UPDATE`, [b.vehicle_id]
    );
    if (!vCheck.rows[0]) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    // A vehicle belongs to a hub. Allotting one from a hub you don't cover used
    // to silently move it (the UPDATE below COALESCEs a new hub_id in), leaving
    // no record that it changed location — so refuse instead. Moving a vehicle
    // between hubs must be a deliberate, audited transfer.
    const scope = await getHubScope(session.userId, session.role);
    if (!scopeAllowsHub(scope, vCheck.rows[0].hub_id)) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json(
        { error: "This vehicle belongs to another hub. Transfer it to your hub before allotting it." },
        { status: 403 }
      );
    }
    if (b.hub_id && vCheck.rows[0].hub_id && b.hub_id !== vCheck.rows[0].hub_id) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json(
        { error: "The vehicle is not at the selected hub. Transfer it first." },
        { status: 400 }
      );
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

    // High-speed vehicles demand DL + PAN on file — enforced here at the moment
    // of truth, whatever the rider picked (or skipped) at KYC time.
    const docsGate = await highSpeedDocsMissing(client, b.vehicle_id, b.rider_id);
    if (docsGate) {
      await client.query("ROLLBACK");
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json({ error: docsGate }, { status: 409 });
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

    // ── When rent starts ───────────────────────────────────────────────────
    //
    // The 3 PM rule (see lib/rentStart.ts). Ops may type a different date, but
    // then an admin has to have approved it — the approval is bound to the
    // rider, the vehicle and the date itself, so a code cannot be moved onto a
    // different allotment or a different day.
    // Ops can state when the rider actually took it; otherwise it is now.
    const handedOverAt = b.handed_over_at ? new Date(b.handed_over_at) : new Date();
    const defaultStart = defaultRentStart(assignedDate, handedOverAt);
    const requestedStart = typeof b.rent_start_date === "string" && b.rent_start_date
      ? b.rent_start_date
      : defaultStart;
    const startOverridden = requestedStart !== defaultStart;
    let startApprovedBy: string | null = null;
    if (startOverridden) {
      const approvalId = typeof b.approval_id === "string" ? b.approval_id : "";
      const parts = { rider: b.rider_id, vehicle: b.vehicle_id, rent_start_date: requestedStart };
      if (!approvalId) {
        await client.query("ROLLBACK");
        if (idem.mode === "claimed") await abortIdempotency(idem);
        return NextResponse.json(
          {
            error: `Rent would normally start on ${defaultStart} — a different date needs an admin's approval`,
            code: "approval_required",
            approval: {
              action: "allotment_start_date",
              summary: `Start rent on ${requestedStart} instead of ${defaultStart}`,
              parts,
            },
          },
          { status: 428 }
        );
      }
      const check = await consumeApproval(client, {
        id: approvalId,
        action: "allotment_start_date",
        fingerprint: fingerprint("allotment_start_date", parts),
      });
      if (!check.ok) {
        await client.query("ROLLBACK");
        if (idem.mode === "claimed") await abortIdempotency(idem);
        return NextResponse.json({ error: check.error, code: "approval_invalid" }, { status: 400 });
      }
      startApprovedBy = check.approvedBy;
    }

    // How much of the cash taken at handover is RENT.
    //
    // This used to be inferred: any positive amount_collected was read as "week 1
    // paid" and a payment of exactly daily_rent x 7 was written, whatever was
    // actually handed over. That invented ₹5,180 of payments across three riders —
    // ops typed ₹1 on a no-cash swap because the form rejected ₹0, and the system
    // recorded a full week and gave away seven days of coverage.
    //
    // It cannot be derived from the other fields either: the onboarding fee is
    // charged once per relationship, so subtracting it on a continuation
    // double-counts (Rajendra's ₹2,640 came out as 4.75 days), and a partly-paid
    // fee makes it negative. So ops state it.
    //
    // Older ops-app builds cannot send this field. For them we fall back to the
    // previous behaviour rather than recording no rent and showing every new
    // rider as instantly overdue. Remove the fallback once the fleet is updated —
    // until then an old APK can still create a phantom.
    const rentStated = b.rent_collected != null && b.rent_collected !== "";
    const collectedTotal = Number(b.amount_collected ?? 0) || 0;
    const rentCollected = rentStated
      ? Math.max(0, Number(b.rent_collected) || 0)
      : collectedTotal > 0
        ? dailyRent * 7          // legacy client: assume the usual advance week
        : 0;
    if (rentStated && rentCollected > collectedTotal) {
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json(
        { error: "Rent collected cannot be more than the total amount collected", field: "rent_collected" },
        { status: 400 }
      );
    }
    // Days bought = money / rate, exactly as a mid-cycle payment works. The
    // remainder is banked rather than rounded away.
    const daysBought = Math.floor(rentCollected / dailyRent + 1e-9);
    const rentRemainder = Math.round((rentCollected - daysBought * dailyRent) * 100) / 100;

    // If the rider's vehicle was just swapped out due to a hardware fault (marked at
    // return time — see app/api/allotments/[id]/return), continue their existing rent
    // cycle from where it left off instead of starting a fresh week: they already paid
    // for days beyond the swap date. non_functional_days is NOT applied here — it sits
    // as a pending waiver request until someone with can_approve_rent_waivers approves
    // it (see the INSERT below), so the rider is shown owing full rent until then.
    // Marks the old row consumed immediately so this can never be matched again by a
    // later, unrelated allotment for the same rider.
    const priorSwap = await client.query(
      `SELECT id, to_char(paid_through_date,'YYYY-MM-DD') AS paid_through_date,
              to_char(returned_date,'YYYY-MM-DD') AS returned_date,
              non_functional_days, allotment_code
       FROM ${schemas.ops}.rider_vehicle_assignments
       WHERE rider_id = $1 AND status = 'returned' AND is_issue_swap = true
       ORDER BY returned_date DESC, created_at DESC LIMIT 1`,
      [b.rider_id]
    );
    const carryOver = priorSwap.rows[0];

    let paidThroughDateValue;
    // Days between giving one vehicle back and taking the next — not chargeable.
    // (Distinct from the `gapDays` further down, which decides whether the
    // onboarding fee applies again after a 15-day break.)
    let noVehicleDays = 0;
    if (carryOver) {
      // Continue the existing cycle — the rider already paid past the swap date.
      //
      // Days between handing the old vehicle back and taking the new one are NOT
      // chargeable: the rider had nothing. Carrying the date without crediting
      // that gap is what billed Rajendra for 5–13 Aug and Ankesh for three days.
      // Genuine arrears from the previous tenancy still carry, because they sit
      // before the return rather than inside the gap.
      const carried = new Date(carryOver.paid_through_date + "T00:00:00Z");
      if (carryOver.returned_date) {
        const back = new Date(carryOver.returned_date + "T00:00:00Z");
        const start = new Date(assignedDate + "T00:00:00Z");
        noVehicleDays = Math.max(0, Math.round((start.getTime() - back.getTime()) / 86400000) - 1);
      }
      carried.setUTCDate(carried.getUTCDate() + noVehicleDays + daysBought);
      paidThroughDateValue = carried.toISOString().slice(0, 10);
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments SET is_issue_swap = false WHERE id = $1`,
        [carryOver.id]
      );
    } else {
      // "Paid through" is the last covered day, so with nothing paid it is the
      // day BEFORE rent starts. Anchoring on the rent start date rather than the
      // handover date is what makes the 3 PM rule (and any approved override)
      // actually move the money.
      const base = new Date(requestedStart + "T00:00:00Z");
      base.setUTCDate(base.getUTCDate() - 1 + daysBought);
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
        daily_rent, paid_through_date, continues_from_assignment_id, allotment_code,
        handed_over_at, rent_start_date, rent_start_overridden, rent_start_approved_by
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id, allotment_code`,
      [
        b.rider_id, b.vehicle_id, b.hub_id ?? null, assignedDate,
        b.amount_collected ?? null, b.payment_screenshot_url ?? null,
        b.undertaking_url ?? null, b.allotment_pics ?? null, session.name,
        dailyRent, paidThroughDateValue, carryOver ? carryOver.id : null, allotmentCode,
        handedOverAt, requestedStart, startOverridden, startApprovedBy,
      ]
    );

    // ── Spend any balance the rider is carrying ────────────────────────────
    //
    // Days paid for on a previous scooter and not used up (see the return
    // route). Moved into this assignment's rent_credit, which the outstanding
    // calculation already subtracts — so it lands as a reduction on the very
    // first week rather than needing a rule of its own.
    //
    // Never refunded in cash, by policy; it can only be spent this way.
    // Read under a row lock, then clear. Deliberately two statements: RETURNING
    // hands back the NEW row (always zero), and a CTE that reads the old value
    // returns NULL to RETURNING — which silently wiped the balance without ever
    // applying it. Two plain statements inside the transaction are correct and
    // obvious, and the lock still stops two allotments spending it twice.
    const balRow = await client.query(
      `SELECT COALESCE(balance, 0)::numeric AS balance FROM ${schemas.ops}.riders WHERE id = $1 FOR UPDATE`,
      [b.rider_id]
    );
    const spent = Number(balRow.rows[0]?.balance ?? 0);
    if (spent > 0) {
      await client.query(`UPDATE ${schemas.ops}.riders SET balance = 0 WHERE id = $1`, [b.rider_id]);
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments
         SET rent_credit = COALESCE(rent_credit, 0) + $2 WHERE id = $1`,
        [result.rows[0].id, spent]
      );
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_balance_entries
           (rider_id, delta, balance_after, reason, assignment_id, created_by)
         VALUES ($1, $2, 0, $3, $4, $5)`,
        [b.rider_id, -spent, "Applied to new allotment", result.rows[0].id, session.name]
      );
    }

    // Record the week-1 prepaid advance so it shows up in the rider's payment history
    // (one week's rent, not the raw cash figure). payment_date is the day the money
    // was actually received — today — not the period end, which put future dates in
    // the Payments Received list for freshly onboarded riders.
    if (rentCollected > 0) {
      // Record what was actually handed over, for the days it actually buys —
      // not an assumed week. payment_date is the day the money arrived; the
      // period is the stretch it covers, starting the day after handover.
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
         VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date, $4::date + 1, $4::date + $5::int)`,
        [b.rider_id, b.vehicle_id, rentCollected, assignedDate, Math.max(1, daysBought)]
      );
    }

    // Part-rupees that didn't buy a whole day are banked on the assignment, the
    // same as any mid-cycle payment, instead of being rounded away.
    if (rentRemainder > 0) {
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments
         SET rent_credit = COALESCE(rent_credit, 0) + $2 WHERE id = $1`,
        [result.rows[0].id, rentRemainder]
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
      // hub_id only fills a blank (fresh stock); it never overwrites an existing
      // hub — see the cross-hub guard above.
      `UPDATE ${schemas.ops}.vehicles SET status = 'assigned', hub_id = COALESCE(hub_id, $1) WHERE id = $2`,
      [b.hub_id ?? null, b.vehicle_id]
    );
    await logVehicleStatus(client, {
      vehicleId: b.vehicle_id, from: "ready_to_deploy", to: "assigned",
      reason: `Allotted (${allotmentCode})`, source: "allotment", actor: session.name,
    });

    await client.query("COMMIT");

    // The scooter is theirs from this moment — tell them.
    pushToRiderAsync(b.rider_id, "vehicle_ready");

    await writeAudit({
      action: "allotment_created", entity: "assignment", entityId: result.rows[0].id,
      actorId: session.userId, actorName: session.name, req,
      details: {
        rider_id: b.rider_id, vehicle_id: b.vehicle_id,
        allotment_code: result.rows[0].allotment_code,
        amount_collected: b.amount_collected ?? null,
        rent_start_date: requestedStart,
        rent_start_overridden: startOverridden,
        rent_start_approved_by: startApprovedBy,
      },
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
