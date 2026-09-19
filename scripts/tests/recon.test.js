// Reconciling the payment book against a bank statement.
//
// The danger in a reconciliation tool is not that it fails to match — it is
// that it matches the WRONG things confidently, or reads a statement it does
// not understand and reports a number anyway. Both would be acted on. So these
// checks care as much about what it refuses to do as what it does.
const { S, A, BASE, connect, tally, fixtures, cleanup, istToday, addDays, uniq } = require("./_harness");

// A minimal HDFC-shaped statement: letterhead, then the header row, then rows.
function statementCsv(rows, accountNo = "50200120920583") {
  const head = [
    "HDFC BANK Ltd.,,,,,,",
    `,,,,Account No :${accountNo},,`,
    ",,,,,,",
    "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  ];
  const body = rows.map((r) => {
    const ref = r.ref ?? "";
    const dep = r.deposit ?? "";
    const wdr = r.withdrawal ?? "";
    return `${r.date},"${r.narration}",${ref},${r.date},${wdr},${dep},`;
  });
  return head.concat(body).join("\n");
}

const dmy = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const upi = (payer, utr, note = "PAID VIA NAVI UPI") =>
  `UPI-${payer.toUpperCase()}-${payer.toLowerCase().replace(/\s/g, "")}@ybl-HDFC0001899-${utr}-${note}`;

module.exports = async function run() {
  const t = tally("recon");
  const c = connect();
  await c.connect();
  let f, viewer;
  try {
    f = await fixtures(c);
    const today = istToday();
    const d1 = addDays(today, -6), d2 = addDays(today, -5), d3 = addDays(today, -4);

    // Money has to exist in the book before it can be reconciled.
    const mkPayment = async (rider, date, amount, utr = null) => {
      const v = await f.vehicle();
      return (await c.query(
        `INSERT INTO ${S}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, payment_utr)
         VALUES ($1,$2,$3,$4::date,$5) RETURNING id`,
        [rider.id, v, amount, date, utr])).rows[0].id;
    };

    const post = async (csv, from, to, headers = f.staff) => {
      const fd = new FormData();
      fd.append("file", new Blob([csv], { type: "text/csv" }), "stmt.csv");
      fd.append("from", from);
      fd.append("to", to);
      // FormData sets its own content-type boundary.
      const { "Content-Type": _drop, ...rest } = headers;
      const res = await fetch(`${BASE}/api/recon/run`, { method: "POST", headers: rest, body: fd });
      return { res, json: await res.json().catch(() => ({})) };
    };

    // ── it refuses what it cannot read ────────────────────────────────────
    let r = await post("just,some,columns\n1,2,3", d1, d3);
    t.check("a file that is not a statement is refused", r.res.status === 422, String(r.res.status));
    t.check("...and says what it expected", /Date.*Narration.*Deposit|does not look like a bank statement/i.test(r.json.error ?? ""),
      (r.json.error ?? "").slice(0, 70));

    // ── only admins ───────────────────────────────────────────────────────
    viewer = await fixtures(c, { role: "hub_incharge" });
    r = await post(statementCsv([]), d1, d3, viewer.staff);
    t.check("a non-admin cannot reconcile", r.res.status === 403, String(r.res.status));
    const anon = await fetch(`${BASE}/api/recon/run`, { method: "POST" });
    t.check("no session, no reconciliation", anon.status === 401, String(anon.status));

    // ── an exact UTR is matched, and nothing else is guessed ──────────────
    const alpha = await f.rider({ name: `ZZ Alpha ${uniq()}` });
    const UTR = "610" + String(Date.now()).slice(-9);
    await mkPayment(alpha, d1, 1680, UTR);
    let csv = statementCsv([
      { date: dmy(d1), narration: upi("Someone Else", UTR), ref: `0000${UTR}`, deposit: 1680 },
    ]);
    r = await post(csv, d1, d3);
    t.check("a reconciliation runs", r.res.ok, `${r.res.status} ${JSON.stringify(r.json).slice(0, 80)}`);
    t.check("...an exact UTR is matched even when the payer name differs",
      r.json.totals?.byUtr === 1, JSON.stringify(r.json.totals ?? {}).slice(0, 90));
    t.check("...and the account number is read back", r.json.statement?.accountTail === "0583",
      String(r.json.statement?.accountTail));

    // ── the payer's name decides when the UTR is absent ───────────────────
    const bravo = await f.rider({ name: `ZZ Bravo ${uniq()}` });
    await mkPayment(bravo, d2, 1820);
    csv = statementCsv([
      { date: dmy(d2), narration: upi(`ZZ Bravo`, "999900001111"), ref: "0000999900001111", deposit: 1820 },
    ]);
    r = await post(csv, d2, d2);
    t.check("a credit is matched on the payer's name", r.json.totals?.byName === 1,
      JSON.stringify(r.json.totals ?? {}).slice(0, 90));

    // ── two identical amounts, no names: refuse rather than guess ─────────
    const c1 = await f.rider({ name: `ZZ Charlie ${uniq()}` });
    const c2 = await f.rider({ name: `ZZ Delta ${uniq()}` });
    await mkPayment(c1, d3, 1680);
    await mkPayment(c2, d3, 1680);
    csv = statementCsv([
      { date: dmy(d3), narration: "NEFT CR-XXXX-UNKNOWN SENDER ONE", ref: "0000111122223333", deposit: 1680 },
      { date: dmy(d3), narration: "NEFT CR-XXXX-UNKNOWN SENDER TWO", ref: "0000444455556666", deposit: 1680 },
    ]);
    r = await post(csv, d3, d3);
    t.check("two anonymous credits for two identical payments are not guessed at",
      r.json.totals?.matchedCount === 0, JSON.stringify(r.json.totals ?? {}).slice(0, 90));
    t.check("...both are reported unmatched instead", r.json.totals?.unmatchedCount === 2,
      String(r.json.totals?.unmatchedCount));

    // ── a week paid in instalments ────────────────────────────────────────
    const echo = await f.rider({ name: `ZZ Echo ${uniq()}` });
    await mkPayment(echo, d3, 1680);
    csv = statementCsv([
      { date: dmy(d1), narration: upi("ZZ Echo", "700000000001"), ref: "0000700000000001", deposit: 1000 },
      { date: dmy(d2), narration: upi("ZZ Echo", "700000000002"), ref: "0000700000000002", deposit: 680 },
    ]);
    r = await post(csv, d3, d3);
    t.check("a week paid in two parts is recognised", r.json.totals?.bySplit === 1,
      JSON.stringify(r.json.totals ?? {}).slice(0, 90));

    // ── a window the statement does not cover ─────────────────────────────
    const foxtrot = await f.rider({ name: `ZZ Foxtrot ${uniq()}` });
    const longAgo = addDays(today, -400);
    await mkPayment(foxtrot, longAgo, 1680);
    csv = statementCsv([{ date: dmy(d1), narration: upi("ZZ Foxtrot", "700000000003"), ref: "0000700000000003", deposit: 1680 }]);
    r = await post(csv, longAgo, longAgo);
    t.check("a range outside the statement is flagged, not silently reconciled",
      (r.json.warnings ?? []).some((w) => /do not overlap|outside the statement/i.test(w)),
      JSON.stringify(r.json.warnings ?? []).slice(0, 110));

    // ── an empty range is refused ─────────────────────────────────────────
    r = await post(statementCsv([{ date: dmy(d1), narration: upi("X", "700000000004"), ref: "1", deposit: 100 }]),
      addDays(today, -800), addDays(today, -799));
    t.check("a range with no payments is refused", r.res.status === 422, String(r.res.status));

    // ── download is bound to the run and to its owner ─────────────────────
    await mkPayment(alpha, d2, 500, null);
    r = await post(statementCsv([{ date: dmy(d2), narration: upi("ZZ Alpha", "700000000005"), ref: "0000700000000005", deposit: 500 }]), d2, d2);
    const token = r.json.token;
    t.check("a run returns a token", !!token, String(token));
    let dl = await fetch(`${BASE}/api/recon/download?token=${token}`, { headers: f.staff });
    t.check("the workbook downloads", dl.ok, String(dl.status));
    t.check("...as a spreadsheet",
      (dl.headers.get("content-type") ?? "").includes("spreadsheetml"), dl.headers.get("content-type"));
    const bytes = Buffer.from(await dl.arrayBuffer());
    t.check("...with real content", bytes.length > 5000 && bytes.slice(0, 2).toString() === "PK", String(bytes.length));

    dl = await fetch(`${BASE}/api/recon/download?token=${token}`, { headers: viewer.staff });
    t.check("someone else's token is no use to a non-admin", dl.status === 403, String(dl.status));
    dl = await fetch(`${BASE}/api/recon/download?token=not-a-real-token`, { headers: f.staff });
    t.check("an unknown token is refused", dl.status === 404, String(dl.status));

    // ── sending ───────────────────────────────────────────────────────────
    let send = await fetch(`${BASE}/api/recon/send`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ token, userIds: [] }),
    });
    t.check("sending to nobody is refused", send.status === 400, String(send.status));

    // A non-admin id must not become a recipient of the bank statement.
    const nonAdminId = viewer.userId;
    send = await fetch(`${BASE}/api/recon/send`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ token, userIds: [nonAdminId] }),
    });
    t.check("a non-admin cannot be made a recipient", send.status === 400, String(send.status));

    send = await fetch(`${BASE}/api/recon/send`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ token, userIds: [f.userId] }),
    });
    const sj = await send.json().catch(() => ({}));
    t.check("it sends to a chosen admin", send.ok && sj.sent === true, `${send.status} ${JSON.stringify(sj).slice(0, 80)}`);

    send = await fetch(`${BASE}/api/recon/send`, {
      method: "POST", headers: f.staff, body: JSON.stringify({ token, userIds: [f.userId] }),
    });
    t.check("...and the run is discarded afterwards, not left in memory", send.status === 404, String(send.status));
    dl = await fetch(`${BASE}/api/recon/download?token=${token}`, { headers: f.staff });
    t.check("...so the workbook is no longer downloadable", dl.status === 404, String(dl.status));
  } catch (e) {
    t.fail++; t.failures.push("threw"); console.error("  THREW:", e.stack);
  } finally {
    await c.query(`DELETE FROM ${S}.rider_payments WHERE rider_id IN
      (SELECT id FROM ${S}.riders WHERE name LIKE 'ZZ %')`).catch(() => {});
    if (viewer) await cleanup(c, viewer.made);
    if (f) await cleanup(c, f.made);
    await c.end();
  }
  return t;
};
