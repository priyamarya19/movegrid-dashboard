// A waiver is a discount, not free days.
//
// Priyam's rule (3 Sep 2026): the rent week never moves. Week 1–7 stays 1–7 and
// the next is still 8–14; what changes is that the rider hands over less cash
// for the week their vehicle was down.
//
// Approving used to push paid_through_date forward by the waived days, which
// handed the rider the days as coverage AND slid their collection day later —
// again on every later waiver. Shashank's had drifted eleven days.
const { S, BASE, connect, tally, fixtures, cleanup, istToday, addDays } = require("./_harness");

module.exports = async function run() {
  const t = tally("waivers");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const today = istToday();
    const RATE = 240;
    const WEEK = RATE * 7;

    // Three days behind, so there is something for the discount to come off.
    // Paid up to today would owe ₹0 and the reduction would be invisible.
    const rider = await f.rider();
    const vehicle = await f.vehicle();
    const asgn = (await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status,
          amount_collected, rent_collected, daily_rent, paid_through_date, handed_over_at)
       VALUES ($1,$2,$3,$4::date,$5::date,'active',$6,$6,$7,$8::date, now()) RETURNING id`,
      [rider.id, vehicle, f.hub, addDays(today, -10), addDays(today, -9), WEEK, RATE, addDays(today, -3)]
    )).rows[0].id;

    const state = async () => (await c.query(
      `SELECT to_char(paid_through_date,'YYYY-MM-DD') pt, COALESCE(rent_credit,0)::numeric credit,
              GREATEST(0, CEIL(GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - paid_through_date),0)/7.0)::int
                * daily_rent*7 - COALESCE(rent_credit,0))::int owed
         FROM ${S}.rider_vehicle_assignments WHERE id=$1`, [asgn])).rows[0];

    const before = await state();
    t.check("rider starts 3 days behind, owing a week",
      before.pt === addDays(today, -3) && Number(before.owed) === WEEK,
      `paid through ${before.pt}, owes ₹${before.owed}`);

    // ── approve a 2-day waiver ────────────────────────────────────────────
    const req = (await c.query(
      `INSERT INTO ${S}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, requested_by, status)
       VALUES ($1,$2,2,'ZZ Test','pending') RETURNING id`, [rider.id, asgn])).rows[0].id;

    let r = await fetch(`${BASE}/api/rent-waivers/${req}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify({ action: "approve" }),
    });
    t.check("a waiver can be approved", r.ok, String(r.status));

    const after = await state();

    // The whole rule, in one assertion.
    t.check("the rent week does NOT move", after.pt === before.pt,
      `paid through ${before.pt} → ${after.pt}`);
    t.check("...the waived days become credit instead", Number(after.credit) === 2 * RATE,
      `₹${after.credit}`);
    t.check("...so the rider owes 2 days less", Number(before.owed) - Number(after.owed) === 2 * RATE,
      `₹${before.owed} → ₹${after.owed}`);

    // ── and the discount survives into the next payment ───────────────────
    //
    // Paying a short week must still buy the full seven days, or the cycle
    // drifts the other way and the discount is silently clawed back.
    const short = WEEK - 2 * RATE;
    r = await fetch(`${BASE}/api/riders/${rider.id}/rent-received`, {
      method: "POST", headers: f.staff,
      body: JSON.stringify({ amount: short, payment_mode: "Cash", payment_screenshot_url: "test/proof.jpg" }),
    });
    const paid = await state();
    if (!r.ok) {
      t.check("a short payment is accepted", false, `${r.status} ${await r.text().catch(() => "")}`.slice(0, 90));
    } else {
      t.check("a short payment is accepted", true, `₹${short}`);
      t.check("...and still buys the whole week", paid.pt === addDays(before.pt, 7),
        `paid through ${before.pt} → ${paid.pt}`);
      t.check("...consuming the credit", Number(paid.credit) === 0, `₹${paid.credit}`);
    }

    // ── a fractional waiver needs no whole-day rounding ───────────────────
    const rider2 = await f.rider();
    const vehicle2 = await f.vehicle();
    const asgn2 = (await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status,
          amount_collected, rent_collected, daily_rent, paid_through_date, handed_over_at)
       VALUES ($1,$2,$3,$4::date,$5::date,'active',$6,$6,$7,$8::date, now()) RETURNING id`,
      [rider2.id, vehicle2, f.hub, addDays(today, -7), addDays(today, -6), WEEK, RATE, today]
    )).rows[0].id;
    const req2 = (await c.query(
      `INSERT INTO ${S}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, requested_by, status)
       VALUES ($1,$2,1.5,'ZZ Test','pending') RETURNING id`, [rider2.id, asgn2])).rows[0].id;
    await fetch(`${BASE}/api/rent-waivers/${req2}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify({ action: "approve" }),
    });
    const frac = (await c.query(
      `SELECT to_char(paid_through_date,'YYYY-MM-DD') pt, COALESCE(rent_credit,0)::numeric credit
         FROM ${S}.rider_vehicle_assignments WHERE id=$1`, [asgn2])).rows[0];
    t.check("1.5 days credits ₹360, not a rounded day", Number(frac.credit) === 1.5 * RATE, `₹${frac.credit}`);
    t.check("...and still does not move the week", frac.pt === today, frac.pt);

    // ── rejecting changes nothing ─────────────────────────────────────────
    const rider3 = await f.rider();
    const vehicle3 = await f.vehicle();
    const asgn3 = (await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status,
          amount_collected, rent_collected, daily_rent, paid_through_date, handed_over_at)
       VALUES ($1,$2,$3,$4::date,$5::date,'active',$6,$6,$7,$8::date, now()) RETURNING id`,
      [rider3.id, vehicle3, f.hub, addDays(today, -7), addDays(today, -6), WEEK, RATE, today]
    )).rows[0].id;
    const req3 = (await c.query(
      `INSERT INTO ${S}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, requested_by, status)
       VALUES ($1,$2,3,'ZZ Test','pending') RETURNING id`, [rider3.id, asgn3])).rows[0].id;
    r = await fetch(`${BASE}/api/rent-waivers/${req3}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify({ action: "reject" }),
    });
    t.check("a waiver can be rejected", r.ok, String(r.status));
    const rej = (await c.query(
      `SELECT to_char(paid_through_date,'YYYY-MM-DD') pt, COALESCE(rent_credit,0)::numeric credit
         FROM ${S}.rider_vehicle_assignments WHERE id=$1`, [asgn3])).rows[0];
    t.check("...and gives nothing away", rej.pt === today && Number(rej.credit) === 0,
      `paid through ${rej.pt}, credit ₹${rej.credit}`);

    // ── it cannot be approved twice ───────────────────────────────────────
    r = await fetch(`${BASE}/api/rent-waivers/${req}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify({ action: "approve" }),
    });
    t.check("an already-resolved waiver is refused", !r.ok, String(r.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
