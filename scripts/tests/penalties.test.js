// A penalty is owed whether or not the rent is current.
//
// ₹1,93,801 across 68 penalties accumulated with nobody chasing any of it,
// because every collections surface is built on paid_through_date and a penalty
// lives in its own table. A rider could read ₹0 outstanding on every report and
// still owe ₹11,120 for a smashed chassis. The call list now carries them, and
// carries the rider even when the rent is fully paid.
const { S, BASE, connect, tally, fixtures, cleanup, env } = require("./_harness");

module.exports = async function run() {
  const t = tally("penalties");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const RATE = 240;

    // A rider paid up to today: nothing about the rent should put them on a list.
    const rider = await f.rider();
    const vehicle = await f.vehicle();
    let r = await fetch(`${BASE}/api/allotments`, {
      method: "POST", headers: f.staff,
      body: JSON.stringify({
        rider_id: rider.id, vehicle_id: vehicle, hub_id: f.hub,
        rider_mode: "Rider rental", rental_mode: "weekly", daily_rent: RATE,
        amount_collected: RATE * 7, rent_collected: RATE * 7,
      }),
    });
    t.check("a rider is allotted and paid up", r.status === 201, String(r.status));
    const asgn = (await c.query(
      `SELECT id, vehicle_id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`,
      [rider.id])).rows[0];

    const callList = async () => {
      const res = await fetch(`${BASE}/api/reports/rent-due/send?preview=1`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Cron-Secret": env.CRON_SECRET ?? "" },
      });
      const j = await res.json();
      return { res, rows: j.rows ?? [], me: (j.rows ?? []).find((x) => x.rider_id === rider.id) };
    };

    // ── with rent current and no penalty, they are not on the list ─────────
    let { res, me } = await callList();
    t.check("the preview returns the list without sending mail", res.ok, String(res.status));
    t.check("a rider who owes nothing is not called", !me, JSON.stringify(me ?? null).slice(0, 60));

    // ── a penalty alone puts them on it ───────────────────────────────────
    await c.query(
      `INSERT INTO ${S}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by, created_at)
       VALUES ($1,$2,$3,4500,'ZZ chassis damage','pending','test', now() - interval '40 days')`,
      [rider.id, asgn.vehicle_id, asgn.id]);
    ({ me } = await callList());
    t.check("an unpaid penalty puts a rent-current rider on the call list", !!me, JSON.stringify(me ?? null).slice(0, 60));
    t.check("...for the penalty amount", me?.penalty_pending === 4500, String(me?.penalty_pending));
    t.check("...counted", me?.penalty_count === 1, String(me?.penalty_count));
    t.check("...with its age, so old debt can be escalated", me?.penalty_oldest_days >= 40, String(me?.penalty_oldest_days));
    t.check("...while the rent still reads as owing nothing", me?.outstanding === 0, String(me?.outstanding));

    // ── penalties are never folded into the rent balance ──────────────────
    // Rent arithmetic has to stay rent arithmetic: a penalty must not make a
    // rider look behind, or the days-behind buckets and reminders go wrong.
    t.check("a penalty does not make the rider look behind", (me?.days_behind ?? 1) <= 0, String(me?.days_behind));

    // ── several penalties add up ──────────────────────────────────────────
    await c.query(
      `INSERT INTO ${S}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by)
       VALUES ($1,$2,$3,1200,'ZZ challan','pending','test')`,
      [rider.id, asgn.vehicle_id, asgn.id]);
    ({ me } = await callList());
    t.check("two penalties are summed", me?.penalty_pending === 5700, String(me?.penalty_pending));
    t.check("...and counted", me?.penalty_count === 2, String(me?.penalty_count));

    // ── paying one drops it out of the total ──────────────────────────────
    await c.query(
      `UPDATE ${S}.rider_penalties SET status='paid', paid_at=now()
        WHERE rider_id=$1 AND detail='ZZ challan'`, [rider.id]);
    ({ me } = await callList());
    t.check("a paid penalty stops being chased", me?.penalty_pending === 4500, String(me?.penalty_pending));

    // ── clearing the last one takes the rider off the list entirely ────────
    await c.query(
      `UPDATE ${S}.rider_penalties SET status='waived' WHERE rider_id=$1 AND status='pending'`, [rider.id]);
    ({ me } = await callList());
    t.check("with nothing owed at all, the rider comes off the list", !me, JSON.stringify(me ?? null).slice(0, 60));

    // ── the sweep still refuses without the secret ─────────────────────────
    res = await fetch(`${BASE}/api/reports/rent-due/send?preview=1`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    });
    t.check("the preview refuses without the cron secret", res.status === 401, String(res.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    await c.query(`DELETE FROM ${S}.rider_penalties WHERE created_by='test'`).catch(() => {});
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
