// Breadcrumbs from a phone that is offline, backgrounded and low on battery.
//
// Built for a bad network: points are queued to disk and uploaded in batches,
// so a rider in a basement uploads an hour at once when they resurface —
// possibly twice, if the first attempt died halfway.
const { S, BASE, connect, tally, fixtures, cleanup, env } = require("./_harness");
const crypto = require("crypto");

module.exports = async function run() {
  const t = tally("locations");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const rider = await f.rider();
    const rc = await f.riderToken(rider.id, rider.mobile);
    const vehicle = await f.vehicle({ status: "assigned" });
    const asgn = (await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status, daily_rent, handed_over_at)
       VALUES ($1,$2,$3,(now() AT TIME ZONE 'Asia/Kolkata')::date,
               (now() AT TIME ZONE 'Asia/Kolkata')::date,'active',240, now()) RETURNING id`,
      [rider.id, vehicle, f.hub])).rows[0].id;

    const pt = (over = {}) => ({
      client_id: crypto.randomUUID(),
      lat: 28.5355 + Math.random() * 0.01, lng: 77.3910 + Math.random() * 0.01,
      accuracy_m: 12.5, speed_mps: 6.2, heading_deg: 180,
      recorded_at: new Date().toISOString(), ...over,
    });
    const post = (points, headers = rc) => fetch(`${BASE}/api/rider/me/locations`, {
      method: "POST", headers, body: JSON.stringify({ points }),
    });

    // ── a normal batch ────────────────────────────────────────────────────
    const batch = Array.from({ length: 20 }, () => pt());
    let r = await post(batch);
    let j = await r.json();
    t.check("a batch of 20 points is stored", r.ok && j.stored === 20, JSON.stringify(j));
    t.check("...and tracking stays on", j.tracking === true);

    // ── a retry after a dropped connection ────────────────────────────────
    r = await post(batch);
    j = await r.json();
    t.check("re-sending the same batch stores nothing", j.stored === 0 && j.duplicates === 20, JSON.stringify(j));
    let n = (await c.query(`SELECT count(*)::int n FROM ${S}.rider_locations WHERE rider_id=$1`, [rider.id])).rows[0].n;
    t.check("...so an hour of history is not doubled", n === 20, String(n));

    // ── one bad fix must not cost the whole batch ─────────────────────────
    r = await post([
      pt(),
      pt({ lat: 999 }), pt({ lng: -400 }), pt({ client_id: "not-a-uuid" }),
      pt({ recorded_at: "gibberish" }),
      pt({ recorded_at: new Date(Date.now() + 5 * 86400000).toISOString() }),
    ]);
    j = await r.json();
    t.check("bad points are dropped and the good one kept", j.stored === 1 && j.rejected === 5, JSON.stringify(j));

    // ── points belong to a tenancy, never to a rider alone ────────────────
    const tied = (await c.query(
      `SELECT count(*)::int n FROM ${S}.rider_locations WHERE rider_id=$1 AND assignment_id=$2`,
      [rider.id, asgn])).rows[0].n;
    t.check("every point carries its assignment", tied === 21, String(tied));

    // ── an oversized batch is refused, not half-eaten ─────────────────────
    r = await post(Array.from({ length: 501 }, () => pt()));
    t.check("a 501-point batch is refused whole", r.status === 413, String(r.status));

    // ── the return stops the phone, with no push needed ───────────────────
    await c.query(
      `UPDATE ${S}.rider_vehicle_assignments SET status='returned',
              returned_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1`, [asgn]);
    r = await post([pt()]);
    j = await r.json();
    t.check("with no scooter out, the phone is told to stop",
      j.tracking === false && j.stored === 0, JSON.stringify(j));
    n = (await c.query(`SELECT count(*)::int n FROM ${S}.rider_locations WHERE rider_id=$1`, [rider.id])).rows[0].n;
    t.check("...and nothing more is recorded", n === 21, String(n));

    // ── auth ──────────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/api/rider/me/locations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: [pt()] }),
    });
    t.check("no token, no upload", r.status === 401, String(r.status));

    // ── retention ─────────────────────────────────────────────────────────
    await c.query(`UPDATE ${S}.rider_locations SET recorded_at = now() - interval '200 days' WHERE rider_id=$1`,
      [rider.id]);
    r = await fetch(`${BASE}/api/rider-locations/prune`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Cron-Secret": env.CRON_SECRET ?? "" },
    });
    j = await r.json();
    t.check("the prune sweep runs", r.ok, JSON.stringify(j).slice(0, 70));
    n = (await c.query(`SELECT count(*)::int n FROM ${S}.rider_locations WHERE rider_id=$1`, [rider.id])).rows[0].n;
    t.check("...and points past retention are gone", n === 0, String(n));

    r = await fetch(`${BASE}/api/rider-locations/prune`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    });
    t.check("the sweep refuses without the cron secret", r.status === 401, String(r.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
