// Editing a rider's completed record needs an admin's code.
//
// Priyam's rule: "once all the details are captured and saved, edits will only
// be saved by OTP received in admin users". Completing a half-empty record —
// the lead and app-signup case — stays free; amending a finished one does not.
//
// The code is bound to a fingerprint of the exact fields and values, because a
// gate that lets one approval be spent on a different change is not a gate.
const { S, BASE, connect, tally, fixtures, cleanup, crackApprovalCode } = require("./_harness");

module.exports = async function run() {
  const t = tally("rider edit gate");
  const c = connect();
  await c.connect();
  let f, saved = [];
  try {
    f = await fixtures(c);

    // Only this suite's user may approve, so no real admin is emailed a code.
    saved = (await c.query(`SELECT user_id, actions FROM ${S}.approval_approvers`)).rows;
    await c.query(`DELETE FROM ${S}.approval_approvers`);
    await c.query(
      `INSERT INTO ${S}.approval_approvers (user_id, actions) VALUES ($1, ARRAY['rider_edit'])`, [f.userId]);

    // A rider whose record is deliberately incomplete.
    const rider = await f.rider({ name: "ZZ Incomplete" });
    await c.query(
      `UPDATE ${S}.riders SET current_address=NULL, bank=NULL, account_number=NULL, aadhaar=NULL WHERE id=$1`,
      [rider.id]);

    const patch = (body) => fetch(`${BASE}/api/riders/${rider.id}`, {
      method: "PATCH", headers: f.staff, body: JSON.stringify(body),
    });

    // ── filling in a half-empty record is free ────────────────────────────
    let r = await patch({ current_address: "Sector 122, Noida" });
    t.check("completing an incomplete record needs no approval", r.status === 200, String(r.status));

    // ── once complete, an edit is gated ───────────────────────────────────
    await c.query(
      `UPDATE ${S}.riders SET bank='HDFC', account_number='999900001111', aadhaar='999988887777' WHERE id=$1`,
      [rider.id]);
    r = await patch({ name: "ZZ Renamed" });
    const body = await r.json();
    t.check("a completed record demands approval",
      r.status === 428 && body.code === "approval_required", String(r.status));
    t.check("...stating exactly what will be approved", !!body.approval?.parts?.name,
      JSON.stringify(body.approval?.parts ?? {}));
    let now = (await c.query(`SELECT name FROM ${S}.riders WHERE id=$1`, [rider.id])).rows[0].name;
    t.check("...and nothing is written meanwhile", now === "ZZ Incomplete", now);

    // ── the code ──────────────────────────────────────────────────────────
    const req = await fetch(`${BASE}/api/approvals`, {
      method: "POST", headers: f.staff, body: JSON.stringify(body.approval),
    }).then((x) => x.json());
    t.check("an approval request is raised", !!req.id, JSON.stringify(req).slice(0, 80));
    const code = await crackApprovalCode(c, req.id, f.userId);
    t.check("...with a per-approver code", !!code);

    const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
    r = await fetch(`${BASE}/api/approvals/${req.id}/confirm`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ code: wrong }),
    });
    t.check("a wrong code is refused", r.status === 400, String(r.status));

    r = await fetch(`${BASE}/api/approvals/${req.id}/confirm`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ code }),
    });
    const conf = await r.json();
    t.check("the right code is accepted", r.ok, String(r.status));
    t.check("...and identifies the approver", !!conf.approved_by, String(conf.approved_by));

    // ── it cannot be spent on a different change ──────────────────────────
    r = await patch({ name: "ZZ Something Else", approval_id: req.id });
    t.check("the approval cannot be moved to other values", r.status === 400, String(r.status));
    now = (await c.query(`SELECT name FROM ${S}.riders WHERE id=$1`, [rider.id])).rows[0].name;
    t.check("...and that attempt writes nothing", now === "ZZ Incomplete", now);

    r = await patch({ name: "ZZ Renamed", approval_id: req.id });
    t.check("the approved change saves", r.status === 200, String(r.status));
    now = (await c.query(`SELECT name FROM ${S}.riders WHERE id=$1`, [rider.id])).rows[0].name;
    t.check("...and the value lands", now === "ZZ Renamed", now);

    r = await patch({ name: "ZZ Renamed", approval_id: req.id });
    t.check("a spent code cannot be reused", r.status === 400, String(r.status));

    // ── no approvers is a hard stop, not a silent bypass ──────────────────
    await c.query(`DELETE FROM ${S}.approval_approvers`);
    r = await fetch(`${BASE}/api/approvals`, {
      method: "POST", headers: f.staff,
      body: JSON.stringify({ action: "rider_edit", summary: "x", parts: { rider: rider.id, name: "x" } }),
    });
    t.check("with nobody to approve, a request is refused", !r.ok, String(r.status));
    r = await patch({ name: "ZZ Bypass" });
    t.check("...and the edit stays blocked rather than falling open", r.status === 428, String(r.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    await c.query(`DELETE FROM ${S}.approval_approvers WHERE user_id=$1`, [f?.userId]).catch(() => {});
    for (const a of saved) {
      await c.query(
        `INSERT INTO ${S}.approval_approvers (user_id, actions) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET actions=EXCLUDED.actions`, [a.user_id, a.actions]).catch(() => {});
    }
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
