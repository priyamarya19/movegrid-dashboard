// Support is a conversation, and closing it is agreed.
//
// A reply used to resolve the ticket outright — Priyam sent one and it closed.
// And the rider had no way to answer at all: one message out, one reply back,
// end of it.
const { S, BASE, connect, tally, fixtures, cleanup, env } = require("./_harness");

module.exports = async function run() {
  const t = tally("tickets");
  const c = connect();
  await c.connect();
  let f;
  try {
    f = await fixtures(c);
    const rider = await f.rider();
    const rc = await f.riderToken(rider.id, rider.mobile);
    const vehicle = await f.vehicle({ status: "assigned" });

    // Support opens only once a rider has held a scooter.
    await c.query(
      `INSERT INTO ${S}.rider_vehicle_assignments
         (rider_id, vehicle_id, hub_id, assigned_date, rent_start_date, status, daily_rent, handed_over_at)
       VALUES ($1,$2,$3,(now() AT TIME ZONE 'Asia/Kolkata')::date,
               (now() AT TIME ZONE 'Asia/Kolkata')::date,'active',240, now())`,
      [rider.id, vehicle, f.hub]
    );

    // ── the rider raises one ──────────────────────────────────────────────
    let r = await fetch(`${BASE}/api/rider/me/tickets`, {
      method: "POST", headers: rc,
      body: JSON.stringify({ message: "Scooter ki battery jaldi khatam ho rahi hai" }),
    });
    let j = await r.json();
    t.check("a rider can raise a request", r.status === 201, `${r.status} ${JSON.stringify(j).slice(0, 60)}`);
    const ticket = j.id;

    let thread = (await c.query(
      `SELECT author, kind FROM ${S}.rider_ticket_messages WHERE ticket_id=$1 ORDER BY created_at`, [ticket])).rows;
    t.check("...and it opens the thread", thread.length === 1 && thread[0].author === "rider", JSON.stringify(thread));

    const patch = (body) => fetch(`${BASE}/api/rider-tickets/${ticket}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify(body),
    });

    // ── the bug Priyam hit ────────────────────────────────────────────────
    r = await patch({ action: "reply", resolution_note: "Battery check kar liya, kal replace karenge" });
    j = await r.json();
    t.check("an ops reply does NOT close the ticket", r.ok && j.status === "open", `${r.status} ${j.status}`);

    // ── the rider can answer, which they could not before ─────────────────
    r = await fetch(`${BASE}/api/rider/me/tickets/${ticket}/messages`, {
      method: "POST", headers: rc, body: JSON.stringify({ message: "Theek hai, kal aata hoon" }),
    });
    t.check("the rider can write back", r.status === 201, String(r.status));
    thread = (await c.query(
      `SELECT author FROM ${S}.rider_ticket_messages WHERE ticket_id=$1 ORDER BY created_at`, [ticket])).rows;
    t.check("...and the thread reads in order",
      thread.map((m) => m.author).join(",") === "rider,ops,rider", JSON.stringify(thread.map((m) => m.author)));

    // ── closing is the rider's word ───────────────────────────────────────
    r = await fetch(`${BASE}/api/rider/me/tickets/${ticket}/close`, {
      method: "POST", headers: rc, body: JSON.stringify({ approve: true }),
    });
    t.check("a rider cannot close what nobody asked about", r.status === 409, String(r.status));

    r = await patch({ action: "request_close", resolution_note: "Battery badal di. Theek hai?" });
    j = await r.json();
    t.check("ops can ask to close", r.ok && j.status === "pending_closure", `${r.status} ${j.status}`);

    r = await fetch(`${BASE}/api/rider/me/tickets/${ticket}/close`, {
      method: "POST", headers: rc, body: JSON.stringify({ approve: false, message: "Abhi bhi problem hai" }),
    });
    j = await r.json();
    t.check("the rider can decline", r.ok && j.status === "open", `${r.status} ${j.status}`);

    await patch({ action: "request_close", resolution_note: "Ab check kar lijiye" });
    r = await fetch(`${BASE}/api/rider/me/tickets/${ticket}/close`, {
      method: "POST", headers: rc, body: JSON.stringify({ approve: true }),
    });
    t.check("the rider can approve", r.ok, String(r.status));
    const done = (await c.query(`SELECT status, resolved_by FROM ${S}.rider_tickets WHERE id=$1`, [ticket])).rows[0];
    t.check("...and it resolves, credited to the rider",
      done.status === "resolved" && done.resolved_by === "Rider", JSON.stringify(done));

    // ── a closed ticket stays closed ──────────────────────────────────────
    r = await fetch(`${BASE}/api/rider/me/tickets/${ticket}/messages`, {
      method: "POST", headers: rc, body: JSON.stringify({ message: "ek aur baat" }),
    });
    t.check("a closed ticket takes no more messages", r.status === 409, String(r.status));

    // ── both sides see the whole thread ───────────────────────────────────
    const mine = (await fetch(`${BASE}/api/rider/me/tickets`, { headers: rc }).then((x) => x.json()))
      .tickets?.find((x) => x.id === ticket);
    t.check("the rider sees the conversation", (mine?.messages?.length ?? 0) >= 6, String(mine?.messages?.length));
    const queue = (await fetch(`${BASE}/api/rider-tickets`, { headers: f.staff }).then((x) => x.json()))
      .tickets?.find((x) => x.id === ticket);
    t.check("ops see the same conversation", (queue?.messages?.length ?? 0) >= 6, String(queue?.messages?.length));

    // ── silence closes it, but only after a week ──────────────────────────
    const stale = (await c.query(
      `INSERT INTO ${S}.rider_tickets (rider_id, hub_id, message, status, close_requested_at, close_requested_by)
       VALUES ($1,$2,'Purani request','pending_closure', now() - interval '9 days','Ops') RETURNING id`,
      [rider.id, f.hub])).rows[0].id;
    await c.query(
      `INSERT INTO ${S}.rider_ticket_messages (ticket_id, author, body, kind, created_at)
       VALUES ($1,'ops','Theek ho gaya?','close_request', now() - interval '9 days')`, [stale]);
    const fresh = (await c.query(
      `INSERT INTO ${S}.rider_tickets (rider_id, hub_id, message, status, close_requested_at, close_requested_by)
       VALUES ($1,$2,'Nayi request','pending_closure', now() - interval '2 days','Ops') RETURNING id`,
      [rider.id, f.hub])).rows[0].id;

    r = await fetch(`${BASE}/api/rider-tickets/auto-close`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Cron-Secret": env.CRON_SECRET ?? "" },
    });
    t.check("the auto-close sweep runs", r.ok, String(r.status));
    const closed = (await c.query(`SELECT status, resolved_by FROM ${S}.rider_tickets WHERE id=$1`, [stale])).rows[0];
    t.check("...nine days of silence closes it", closed.status === "resolved" && closed.resolved_by === "Auto-closed",
      JSON.stringify(closed));
    const why = (await c.query(
      `SELECT body FROM ${S}.rider_ticket_messages WHERE ticket_id=$1 AND kind='auto_closed'`, [stale])).rows[0];
    t.check("...and says so in the thread", !!why && /7 days/.test(why.body), why?.body?.slice(0, 60));
    const kept = (await c.query(`SELECT status FROM ${S}.rider_tickets WHERE id=$1`, [fresh])).rows[0];
    t.check("two days of silence is left alone", kept.status === "pending_closure", kept.status);

    r = await fetch(`${BASE}/api/rider-tickets/auto-close`, {
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
