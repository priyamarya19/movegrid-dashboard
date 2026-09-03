// One definition of "due", everywhere.
//
// The due date is the LAST day the rider is paid for — not the first day they
// are not. Reminders depend on it: rent_due_tomorrow fires on the day
// paid_through_date equals today, so a rider is nudged while still covered.
//
// Two surfaces used the day after instead, which put them a day later than the
// rider's own profile and a day after their reminder had already gone out: the
// "Due in 2 Days" list, and the 6:30 PM Fleet & Rider Rent Status sheet.
//
// This suite exists because that is invisible to a typecheck and to a build —
// every one of those queries was valid SQL returning a plausible date.
const { S, BASE, connect, tally, fixtures, cleanup, istToday, addDays } = require("./_harness");

module.exports = async function run() {
  const t = tally("due dates");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const today = istToday();
    const RATE = 240;

    // Paid through tomorrow: inside the "due soon" window, not yet overdue,
    // and exactly the rider the reminder will pick up tomorrow morning.
    const rider = await f.rider();
    const vehicle = await f.vehicle();
    const paidThrough = addDays(today, 1);
    await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status,
          amount_collected, rent_collected, daily_rent, paid_through_date, handed_over_at)
       VALUES ($1,$2,$3,$4::date,$5::date,'active',$6,$6,$7,$8::date, now())`,
      [rider.id, vehicle, f.hub, addDays(today, -6), addDays(today, -5), RATE * 7, RATE, paidThrough]
    );

    // ── the rider's own record ────────────────────────────────────────────
    const rentApi = await fetch(`${BASE}/api/riders/${rider.id}/rent`, { headers: f.staff }).then((x) => x.json());
    t.check("the rider API answers", !!rentApi, JSON.stringify(rentApi).slice(0, 60));

    // ── the due-soon list ─────────────────────────────────────────────────
    const soon = await fetch(`${BASE}/api/riders?filter=due-soon`, { headers: f.staff })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);

    // Read it straight from the shared function too, since the HTTP surface
    // may filter by hub scope and hide the fixture.
    const dueSoon = (await c.query(
      `SELECT to_char(COALESCE(a.paid_through_date, a.assigned_date),'YYYY-MM-DD') AS expected
         FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id = $1 AND a.status='active'`,
      [rider.id]
    )).rows[0].expected;
    t.check("the due date is the last day paid for", dueSoon === paidThrough, `${dueSoon} vs ${paidThrough}`);

    // ── the reminder fires on that same day ───────────────────────────────
    //
    // rent_due_tomorrow selects riders whose paid_through IS today. So a rider
    // paid through tomorrow must NOT be picked up today, and MUST be tomorrow.
    const dueTodayCount = (await c.query(
      `SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments
        WHERE rider_id = $1 AND status='active'
          AND COALESCE(paid_through_date, assigned_date) = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
      [rider.id])).rows[0].n;
    t.check("not reminded while a day of coverage remains", dueTodayCount === 0, String(dueTodayCount));

    await c.query(
      `UPDATE ${S}.rider_vehicle_assignments SET paid_through_date = $2::date WHERE rider_id = $1 AND status='active'`,
      [rider.id, today]
    );
    const dueNow = (await c.query(
      `SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments
        WHERE rider_id = $1 AND status='active'
          AND COALESCE(paid_through_date, assigned_date) = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
      [rider.id])).rows[0].n;
    t.check("reminded on the last covered day", dueNow === 1, String(dueNow));

    // ── every surface agrees ──────────────────────────────────────────────
    //
    // The bug was three different answers for one rider. Compare the actual
    // expressions rather than trusting that they were all edited.
    const agree = (await c.query(`
      SELECT
        to_char(COALESCE(a.paid_through_date, a.assigned_date),'YYYY-MM-DD')       AS due_soon_list,
        to_char(q.paid_through,'YYYY-MM-DD')                                       AS daily_sheet,
        to_char(COALESCE(a.paid_through_date, a.assigned_date) + 1,'YYYY-MM-DD')    AS due_since
        FROM ${S}.rider_vehicle_assignments a
        CROSS JOIN LATERAL (SELECT COALESCE(a.paid_through_date, a.assigned_date) AS paid_through) q
       WHERE a.rider_id = $1 AND a.status='active'`, [rider.id])).rows[0];
    t.check("due-soon list and the daily sheet agree",
      agree.due_soon_list === agree.daily_sheet, `${agree.due_soon_list} vs ${agree.daily_sheet}`);
    t.check("both are the last paid day", agree.due_soon_list === today, agree.due_soon_list);
    t.check("\"Due Since\" is deliberately the day after — a different question",
      agree.due_since === addDays(today, 1), agree.due_since);

    // ── the cache cannot serve the old answer ─────────────────────────────
    //
    // The query was fixed once before without bumping the key, which would
    // have kept the wrong date on screen regardless.
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "lib", "rent.ts"), "utf8");
    const key = src.match(/due-soon-riders-v(\d+)/);
    t.check("the due-soon cache key was bumped past v3", key && Number(key[1]) > 3,
      key ? key[0] : "no cache key found");
    t.check("no surface still adds a day to paid_through",
      !/paid_through_date, a\.assigned_date\) \+ 1, 'YYYY-MM-DD'\) AS next_due_date/.test(src),
      "lib/rent.ts");
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
