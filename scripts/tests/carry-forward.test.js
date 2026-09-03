// Prepaid days that outlive the scooter they were bought on.
//
// How many days carry is a judgement, not a subtraction: a week paid through
// the 7th with the scooter back on the 5th is Priyam's own question — 2 days or
// 3? So ops choose, inside a ceiling they cannot exceed. The balance is
// spendable for 15 days; after that it lapses, and lapsing is recorded because
// the money was collected.
const { S, BASE, connect, tally, fixtures, cleanup, istToday, addDays, env } = require("./_harness");

module.exports = async function run() {
  const t = tally("carry forward");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const today = istToday();
    const RATE = 240;
    const WEEK = RATE * 7;

    // Priyam's example: rent week runs 1–7, scooter back on the 5th.
    const day1 = addDays(today, -4);
    const day5 = today;
    const day7 = addDays(today, 2);

    const rider = await f.rider();
    const v1 = await f.vehicle();
    const allot = (vehicle, over = {}) => fetch(`${BASE}/api/allotments`, {
      method: "POST", headers: f.staff,
      body: JSON.stringify({
        rider_id: rider.id, vehicle_id: vehicle, hub_id: f.hub,
        rider_mode: "Rider rental", rental_mode: "weekly", daily_rent: RATE,
        amount_collected: WEEK, rent_collected: WEEK,
        assigned_date: day1, handed_over_at: `${day1}T04:00:00.000Z`, ...over,
      }),
    });

    let r = await allot(v1);
    t.check("a week paid up front allots", r.status === 201, String(r.status));
    const asgn = (await c.query(
      `SELECT id, to_char(paid_through_date,'YYYY-MM-DD') pt FROM ${S}.rider_vehicle_assignments
        WHERE rider_id=$1 AND status='active'`, [rider.id])).rows[0];
    t.check("...covering through day 7", asgn.pt === day7, `${asgn.pt} vs ${day7}`);

    const ret = (body) => fetch(`${BASE}/api/allotments/${asgn.id}/return`, {
      method: "PATCH", headers: f.staff,
      body: JSON.stringify({ returned_date: day5, rent_cleared: false, amount_collected: 0, ...body }),
    });

    // ── the ceiling is what was paid for ──────────────────────────────────
    r = await ret({ carry_forward_days: 4 });
    let j = await r.json();
    t.check("more days than were paid for is refused", r.status === 400 && j.max === 3, `${r.status} max=${j.max}`);

    // ── ops choose 3: the rider brought it in first thing ─────────────────
    r = await ret({ carry_forward_days: 3 });
    t.check("ops' number is accepted", r.ok, String(r.status));
    let bal = (await c.query(
      `SELECT balance::numeric b, balance_days d, to_char(balance_expires_on,'YYYY-MM-DD') e
         FROM ${S}.riders WHERE id=$1`, [rider.id])).rows[0];
    t.check("...3 days of rent is carried", Number(bal.b) === 3 * RATE, `₹${bal.b}`);
    t.check("...and it says 3 days", bal.d === 3, String(bal.d));
    t.check("...spendable for 15 days from the return", bal.e === addDays(day5, 15), String(bal.e));

    let entry = (await c.query(
      `SELECT kind, days FROM ${S}.rider_balance_entries WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [rider.id])).rows[0];
    t.check("...recorded as a carry-forward", entry.kind === "carry_forward" && entry.days === 3, JSON.stringify(entry));

    const stored = (await c.query(
      `SELECT carry_forward_days cd, carry_forward_max_days cm FROM ${S}.rider_vehicle_assignments WHERE id=$1`,
      [asgn.id])).rows[0];
    t.check("...ops' number AND the ceiling are both kept", stored.cd === 3 && stored.cm === 3, JSON.stringify(stored));

    // ── back inside the window: the balance is spent ──────────────────────
    const v2 = await f.vehicle();
    const backOn = addDays(day5, 10);
    r = await allot(v2, { assigned_date: backOn, handed_over_at: `${backOn}T04:00:00.000Z`,
                          amount_collected: 0, rent_collected: 0 });
    t.check("re-allotting inside the window", r.status === 201, String(r.status));
    const spent = (await c.query(
      `SELECT kind, days, delta::numeric d FROM ${S}.rider_balance_entries
        WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 1`, [rider.id])).rows[0];
    t.check("...the balance is applied, not lapsed",
      spent.kind === "spent" && Number(spent.d) === -3 * RATE, JSON.stringify(spent));
    const credit = (await c.query(
      `SELECT rent_credit::numeric rc FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`,
      [rider.id])).rows[0];
    t.check("...landing on the new allotment as credit", Number(credit.rc) === 3 * RATE, String(credit.rc));
    bal = (await c.query(`SELECT balance::numeric b, balance_days d, balance_expires_on e FROM ${S}.riders WHERE id=$1`,
      [rider.id])).rows[0];
    t.check("...and the rider carries nothing now",
      Number(bal.b) === 0 && bal.d === 0 && bal.e === null, JSON.stringify(bal));

    // ── back too late: it lapses, on the record ───────────────────────────
    const asgn2 = (await c.query(
      `SELECT id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`, [rider.id])).rows[0].id;
    await c.query(`UPDATE ${S}.rider_vehicle_assignments SET paid_through_date=$2::date WHERE id=$1`,
      [asgn2, addDays(day5, 14)]);
    await fetch(`${BASE}/api/allotments/${asgn2}/return`, {
      method: "PATCH", headers: f.staff,
      body: JSON.stringify({ returned_date: addDays(day5, 12), rent_cleared: false, amount_collected: 0, carry_forward_days: 2 }),
    });
    bal = (await c.query(
      `SELECT balance::numeric b, balance_days d, to_char(balance_expires_on,'YYYY-MM-DD') e FROM ${S}.riders WHERE id=$1`,
      [rider.id])).rows[0];
    t.check("a second return carries again", Number(bal.b) > 0, `₹${bal.b}, ${bal.d} days`);

    const late = addDays(bal.e, 1);
    const v3 = await f.vehicle();
    r = await allot(v3, { assigned_date: late, handed_over_at: `${late}T04:00:00.000Z`,
                          amount_collected: 0, rent_collected: 0 });
    t.check("a late re-allotment still goes through", r.status === 201, String(r.status));
    const lapsed = (await c.query(
      `SELECT kind, delta::numeric d, reason FROM ${S}.rider_balance_entries
        WHERE rider_id=$1 AND kind='expired' ORDER BY created_at DESC LIMIT 1`, [rider.id])).rows[0];
    t.check("...but the balance lapsed", !!lapsed, JSON.stringify(lapsed ?? null));
    t.check("...and the reason names the window", !!lapsed && /15 days/.test(lapsed.reason), lapsed?.reason?.slice(0, 50));
    const credit2 = (await c.query(
      `SELECT COALESCE(rent_credit,0)::numeric rc FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`,
      [rider.id])).rows[0];
    t.check("...so none of it reached the new allotment", Number(credit2.rc) === 0, String(credit2.rc));

    // ── the sweep catches a rider who never comes back ────────────────────
    await c.query(
      `UPDATE ${S}.riders SET balance=480, balance_days=2, balance_expires_on=$2::date WHERE id=$1`,
      [rider.id, addDays(today, -1)]);
    r = await fetch(`${BASE}/api/rider-balances/expire`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Cron-Secret": env.CRON_SECRET ?? "" },
    });
    t.check("the expiry sweep runs", r.ok, String(r.status));
    bal = (await c.query(`SELECT balance::numeric b, balance_days d FROM ${S}.riders WHERE id=$1`, [rider.id])).rows[0];
    t.check("...clearing a stale balance", Number(bal.b) === 0 && bal.d === 0, JSON.stringify(bal));

    r = await fetch(`${BASE}/api/rider-balances/expire`, { method: "POST", headers: { "Content-Type": "application/json" } });
    t.check("the sweep refuses without the cron secret", r.status === 401, String(r.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
