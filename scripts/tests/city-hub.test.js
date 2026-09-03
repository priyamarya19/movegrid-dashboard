// The city screen must never trap a rider.
//
// It used to refuse anyone holding a scooter and tell them it was at "another
// hub" — without ever comparing hubs. With one hub that could never be true, so
// 15 production riders were stuck: home routes here whenever no hub is set,
// this screen refused them, and the device back button closes the app.
const { S, BASE, connect, tally, fixtures, cleanup, uniq } = require("./_harness");

module.exports = async function run() {
  const t = tally("city / hub");
  const c = connect();
  await c.connect();
  let f, otherHub;
  try {
    f = await fixtures(c);
    const rider = await f.rider();
    const rc = await f.riderToken(rider.id, rider.mobile);

    // ── allotment stamps the hub, which is the root cause ─────────────────
    //
    // Riders reached the trap because nothing wrote their hub. The route must
    // fall back to the vehicle's hub when the client sends none — older
    // ops-app builds send none, which is how it happened.
    const vehicle = await f.vehicle();
    let r = await fetch(`${BASE}/api/allotments`, {
      method: "POST", headers: f.staff,
      body: JSON.stringify({
        rider_id: rider.id, vehicle_id: vehicle,   // deliberately NO hub_id
        rider_mode: "Rider rental", rental_mode: "weekly", daily_rent: 240,
        amount_collected: 1680, rent_collected: 1680,
      }),
    });
    t.check("an allotment with no hub_id is accepted", r.status === 201, String(r.status));
    let row = (await c.query(
      `SELECT ri.assigned_hub_id AS rider_hub, a.hub_id AS asgn_hub
         FROM ${S}.riders ri JOIN ${S}.rider_vehicle_assignments a ON a.rider_id = ri.id AND a.status='active'
        WHERE ri.id = $1`, [rider.id])).rows[0];
    t.check("...the rider gets the vehicle's hub", row.rider_hub === f.hub, String(row.rider_hub));
    t.check("...and so does the assignment", row.asgn_hub === f.hub, String(row.asgn_hub));

    // ── the trap itself ───────────────────────────────────────────────────
    await c.query(`UPDATE ${S}.riders SET assigned_hub_id = NULL WHERE id = $1`, [rider.id]);
    r = await fetch(`${BASE}/api/rider/me/city`, {
      method: "POST", headers: rc, body: JSON.stringify({ hub_id: f.hub }),
    });
    let j = await r.json();
    t.check("a rider can choose the hub their scooter is at", r.ok, `${r.status} ${j.error ?? ""}`);
    row = (await c.query(`SELECT assigned_hub_id FROM ${S}.riders WHERE id = $1`, [rider.id])).rows[0];
    t.check("...so home stops bouncing them back", row.assigned_hub_id === f.hub, String(row.assigned_hub_id));

    // ── missing data is not a mismatch ────────────────────────────────────
    await c.query(`UPDATE ${S}.riders SET assigned_hub_id = NULL WHERE id = $1`, [rider.id]);
    await c.query(`UPDATE ${S}.rider_vehicle_assignments SET hub_id = NULL WHERE rider_id = $1 AND status='active'`, [rider.id]);
    r = await fetch(`${BASE}/api/rider/me/city`, {
      method: "POST", headers: rc, body: JSON.stringify({ hub_id: f.hub }),
    });
    t.check("an assignment with no hub recorded is not refused", r.ok, String(r.status));

    // ── a real mismatch IS refused, and says where the scooter is ─────────
    const t2 = uniq();
    otherHub = (await c.query(
      `INSERT INTO ${S}.hubs (hub_id, hub_name, city) VALUES ($1,$2,'Testpur') RETURNING id`,
      [`ZZ${t2}`, `ZZ Hub ${t2}`])).rows[0].id;
    f.made.hubs.push(otherHub);
    await c.query(`UPDATE ${S}.riders SET assigned_hub_id = NULL WHERE id = $1`, [rider.id]);
    await c.query(`UPDATE ${S}.rider_vehicle_assignments SET hub_id = $2 WHERE rider_id = $1 AND status='active'`,
      [rider.id, f.hub]);
    r = await fetch(`${BASE}/api/rider/me/city`, {
      method: "POST", headers: rc, body: JSON.stringify({ hub_id: otherHub }),
    });
    j = await r.json();
    t.check("a genuinely different hub is refused", r.status === 409 && j.code === "hub_mismatch", `${r.status} ${j.code}`);
    t.check("...and the message names the real hub", /hub|Noida/i.test(j.error ?? ""), j.error);

    // ── an unknown hub is refused ─────────────────────────────────────────
    r = await fetch(`${BASE}/api/rider/me/city`, {
      method: "POST", headers: rc, body: JSON.stringify({ hub_id: "00000000-0000-0000-0000-000000000000" }),
    });
    t.check("an unknown hub is refused", !r.ok, String(r.status));
    r = await fetch(`${BASE}/api/rider/me/city`, { method: "POST", headers: rc, body: JSON.stringify({}) });
    t.check("no hub at all is refused", r.status === 400, String(r.status));

    // ── nobody is left in the trap ────────────────────────────────────────
    const stuck = (await c.query(
      `SELECT count(*)::int n FROM ${S}.riders ri
         JOIN ${S}.rider_vehicle_assignments a ON a.rider_id = ri.id AND a.status='active'
        WHERE ri.assigned_hub_id IS NULL AND ri.id <> $1`, [rider.id])).rows[0].n;
    t.check("no other rider holds a scooter with no hub", stuck === 0, String(stuck));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
