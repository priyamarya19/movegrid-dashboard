// The cut-off rule, and the admin gate on overriding it.
//
// Covers the two faults that reached production: a same-day rent start whose
// week was drawn a day late (Gaurav and Rohit showing PARTIAL on a week they
// had paid in full), and the boundary itself moving from 3 PM to 2 PM.
const {
  S, BASE, connect, tally, fixtures, cleanup, crackApprovalCode, istToday, addDays,
} = require("./_harness");
const { RENT_START_CUTOFF_HOUR } = require("../../lib/rentStartCutoff");

module.exports = async function run() {
  const t = tally("rent start");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const today = istToday();
    const RATE = 240;

    // A handover time on `today`, at the given IST hour.
    const at = (hour, min = 0) =>
      new Date(Date.parse(`${today}T00:00:00Z`) + (hour * 60 + min - 330) * 60000).toISOString();

    const allot = async (over = {}) => {
      const vehicle = over.vehicle ?? (await f.vehicle());
      return fetch(`${BASE}/api/allotments`, {
        method: "POST", headers: f.staff,
        body: JSON.stringify({
          rider_id: over.rider, vehicle_id: vehicle, hub_id: f.hub,
          rider_mode: "Rider rental", rental_mode: "weekly", daily_rent: RATE,
          amount_collected: over.cash ?? RATE * 7, rent_collected: over.rent ?? RATE * 7,
          ...(over.fee !== undefined ? { onboarding_fee: over.fee } : {}),
          ...(over.deposit !== undefined ? { security_deposit: over.deposit } : {}),
          assigned_date: over.date ?? today, handed_over_at: over.handedAt,
          ...(over.startDate ? { rent_start_date: over.startDate } : {}),
          ...(over.approvalId ? { approval_id: over.approvalId } : {}),
        }),
      });
    };

    // ── the boundary ───────────────────────────────────────────────────────
    const early = await f.rider();
    let r = await allot({ rider: early.id, handedAt: at(RENT_START_CUTOFF_HOUR - 1, 30) });
    t.check("handover before the cut-off is accepted", r.status === 201, String(r.status));
    let row = (await c.query(
      `SELECT to_char(rent_start_date,'YYYY-MM-DD') rs, to_char(paid_through_date,'YYYY-MM-DD') pt, rent_start_overridden ovr
         FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`, [early.id])).rows[0];
    t.check("...rent starts the same day", row.rs === today, `${row.rs} vs ${today}`);
    t.check("...paid through covers exactly the week bought", row.pt === addDays(today, 6), row.pt);
    t.check("...not flagged as an override", row.ovr === false);

    const late = await f.rider();
    r = await allot({ rider: late.id, handedAt: at(RENT_START_CUTOFF_HOUR, 5) });
    t.check("handover after the cut-off is accepted", r.status === 201, String(r.status));
    row = (await c.query(
      `SELECT to_char(rent_start_date,'YYYY-MM-DD') rs, to_char(paid_through_date,'YYYY-MM-DD') pt
         FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`, [late.id])).rows[0];
    t.check("...the handover day is free", row.rs === addDays(today, 1), row.rs);
    t.check("...and coverage shifts with it", row.pt === addDays(today, 7), row.pt);

    // Five minutes either side of the boundary must differ. This is the whole
    // rule, and it is one comparison away from being off by an hour.
    const justBefore = await f.rider(), justAfter = await f.rider();
    await allot({ rider: justBefore.id, handedAt: at(RENT_START_CUTOFF_HOUR - 1, 59) });
    await allot({ rider: justAfter.id, handedAt: at(RENT_START_CUTOFF_HOUR, 1) });
    const pair = (await c.query(
      `SELECT rider_id, to_char(rent_start_date,'YYYY-MM-DD') rs FROM ${S}.rider_vehicle_assignments
        WHERE rider_id = ANY($1) AND status='active'`, [[justBefore.id, justAfter.id]])).rows;
    const before = pair.find((x) => x.rider_id === justBefore.id).rs;
    const after = pair.find((x) => x.rider_id === justAfter.id).rs;
    t.check(`${RENT_START_CUTOFF_HOUR}:59 charges the same day`, before === today, before);
    t.check(`${RENT_START_CUTOFF_HOUR + 1}:01 does not`, after === addDays(today, 1), after);

    // ── a back-dated allotment keeps the free day ─────────────────────────
    const back = await f.rider();
    await allot({ rider: back.id, date: addDays(today, -3), handedAt: at(9) });
    row = (await c.query(
      `SELECT to_char(rent_start_date,'YYYY-MM-DD') rs FROM ${S}.rider_vehicle_assignments
        WHERE rider_id=$1 AND status='active'`, [back.id])).rows[0];
    t.check("a back-dated allotment still gets the free day", row.rs === addDays(today, -2),
      `${row.rs} (today's clock says nothing about when they collected)`);

    // ── the week is drawn from the rent start, not a day later ────────────
    //
    // Gaurav's bug: no rent_dues rows yet, so the profile SYNTHESISES week 1.
    // It must land where the nightly job would put it, or a fully paid week
    // reads PARTIAL next to "paid up ₹0".
    const cycle = await fetch(`${BASE}/api/riders/${early.id}/rent`, { headers: f.staff }).then((x) => x.json());
    const weeks = cycle.weeks ?? cycle.cycle ?? [];
    const wk1 = weeks[0];
    t.check("a brand-new allotment has a week 1 before the cron runs", !!wk1, JSON.stringify(weeks).slice(0, 80));
    if (wk1) {
      t.check("...week 1 covers the days the money bought", Number(wk1.paid) === Number(wk1.amount),
        `paid ₹${wk1.paid} of ₹${wk1.amount} for ${wk1.period_start}–${wk1.period_end}`);
      t.check("...so it reads Collected, not Partial", wk1.status === "Collected", wk1.status);
    }

    // ── overriding the date needs an admin ────────────────────────────────
    const ovr = await f.rider();
    const wanted = addDays(today, 4);
    // Only this suite's user may approve, so no real admin is emailed.
    const saved = (await c.query(`SELECT user_id, actions FROM ${S}.approval_approvers`)).rows;
    await c.query(`DELETE FROM ${S}.approval_approvers`);
    await c.query(
      `INSERT INTO ${S}.approval_approvers (user_id, actions) VALUES ($1, ARRAY['allotment_start_date'])`,
      [f.userId]
    );
    try {
      const vehicle = await f.vehicle();
      r = await allot({ rider: ovr.id, vehicle, handedAt: at(9), startDate: wanted });
      const body = await r.json();
      t.check("an override without approval is refused", r.status === 428 && body.code === "approval_required", String(r.status));
      t.check("...and names the date being approved", body.approval?.parts?.rent_start_date === wanted,
        JSON.stringify(body.approval?.parts ?? {}));

      const none = await c.query(`SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments WHERE vehicle_id=$1`, [vehicle]);
      t.check("...the refusal leaves no assignment behind", none.rows[0].n === 0, String(none.rows[0].n));
      const vst = await c.query(`SELECT status FROM ${S}.vehicles WHERE id=$1`, [vehicle]);
      t.check("...and does not hold the vehicle", vst.rows[0].status === "ready_to_deploy", vst.rows[0].status);

      const req = await fetch(`${BASE}/api/approvals`, {
        method: "POST", headers: f.staff, body: JSON.stringify(body.approval),
      }).then((x) => x.json());
      const code = await crackApprovalCode(c, req.id, f.userId);
      t.check("each approver gets their own code", !!code);

      r = await fetch(`${BASE}/api/approvals/${req.id}/confirm`, {
        method: "POST", headers: f.staff, body: JSON.stringify({ code: String((Number(code) + 1) % 1000000).padStart(6, "0") }),
      });
      t.check("a wrong code is refused", r.status === 400, String(r.status));

      r = await fetch(`${BASE}/api/approvals/${req.id}/confirm`, {
        method: "POST", headers: f.staff, body: JSON.stringify({ code }),
      });
      const conf = await r.json();
      t.check("the right code is accepted", r.ok, String(r.status));
      t.check("...and the code identifies who approved", !!conf.approved_by, String(conf.approved_by));

      r = await allot({ rider: ovr.id, vehicle, handedAt: at(9), startDate: addDays(today, 9), approvalId: req.id });
      t.check("the approval cannot be spent on a different date", r.status === 400, String(r.status));

      r = await allot({ rider: ovr.id, vehicle, handedAt: at(9), startDate: wanted, approvalId: req.id });
      t.check("the approved date allots", r.status === 201, String(r.status));
      row = (await c.query(
        `SELECT to_char(rent_start_date,'YYYY-MM-DD') rs, rent_start_overridden ovr, rent_start_approved_by by
           FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`, [ovr.id])).rows[0];
      t.check("...with the date that was approved", row.rs === wanted, row.rs);
      t.check("...flagged as an override", row.ovr === true);
      t.check("...naming the approver", !!row.by, String(row.by));

      // A fresh vehicle: re-using the assigned one trips the "already
      // assigned" guard first and never reaches the approval check.
      r = await allot({ rider: ovr.id, vehicle: await f.vehicle(), handedAt: at(9), startDate: wanted, approvalId: req.id });
      const reuse = await r.json();
      t.check("the code cannot be used twice", r.status === 400 && reuse.code === "approval_invalid",
        `${r.status} ${reuse.code ?? reuse.error ?? ""}`);
    } finally {
      await c.query(`DELETE FROM ${S}.approval_approvers WHERE user_id = $1`, [f.userId]).catch(() => {});
      for (const a of saved) {
        await c.query(
          `INSERT INTO ${S}.approval_approvers (user_id, actions) VALUES ($1,$2)
           ON CONFLICT (user_id) DO UPDATE SET actions = EXCLUDED.actions`, [a.user_id, a.actions]
        ).catch(() => {});
      }
    }

    // ── the stated split is kept, not recomputed and thrown away ──────────
    const split = await f.rider();
    await allot({ rider: split.id, handedAt: at(9), cash: 3680, rent: 1680, fee: 1500, deposit: 500 });
    row = (await c.query(
      `SELECT rent_collected::int rc, fee_collected::int fc, deposit_collected::int dc
         FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`, [split.id])).rows[0];
    t.check("the rent ops stated is stored", row.rc === 1680, String(row.rc));
    t.check("...and so are the fee and deposit", row.fc === 1500 && row.dc === 500,
      `fee ₹${row.fc}, deposit ₹${row.dc}`);
    t.check("...so the handover total reconciles against its parts", row.rc + row.fc + row.dc === 3680,
      `${row.rc} + ${row.fc} + ${row.dc} = ${row.rc + row.fc + row.dc}`);
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
