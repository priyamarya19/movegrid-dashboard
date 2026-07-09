// Onboard the 5 riders the rent-ledger sync skipped (not in DB / no assignment).
// Creates rider (if missing) + a new assignment (EV, allotment date, daily_rent), re-allotting
// the vehicle from its previous holder, then regenerates rent_dues.
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a; }, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = "mg_data_uat";

// name, nickname, mobile, ev_number, daily_rent, allotment date (YYYY-MM-DD)
const NEW = [
  ["Pawan Kumar 01", "pawan",  "8439616892", "MG0426N0049", 240, "2026-06-19"],
  ["Sumit Kumar",    "sumit",  "8510988713", "MG0426N0020", 240, "2026-06-20"],
  ["Mohd Danish",    "Danish", "7820015194", "MG0426N0013", 240, "2026-06-23"],
  ["Mohammad Ali",   "Badal",  "9568080124", "MG0426N0039", 260, "2026-06-23"],
  ["Avnish",         "Avnish", "9956661380", "MG0426N0045", 240, "2026-06-24"],
];

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const istToday = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };

async function nextCode() {
  const r = await client.query(`SELECT rider_code FROM ${S}.riders WHERE rider_code ~ '^MG[0-9]+$' ORDER BY (regexp_replace(rider_code,'\\D','','g'))::int DESC LIMIT 1`);
  const n = parseInt((r.rows[0]?.rider_code ?? "MG000000").replace(/\D/g, ""), 10) + 1;
  return "MG" + String(n).padStart(6, "0");
}

async function run() {
  await client.connect();
  await client.query("BEGIN");
  try {
    const hub = (await client.query(`SELECT id FROM ${S}.hubs WHERE hub_name='Noida-122' LIMIT 1`)).rows[0]?.id ?? null;
    let created = 0, assigned = 0;
    for (const [name, nick, mobile, ev, daily, date] of NEW) {
      const v = (await client.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1 LIMIT 1`, [ev])).rows[0];
      if (!v) { console.log(`  ! vehicle ${ev} not found — skipping ${name}`); continue; }

      let rider = (await client.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1 LIMIT 1`, [mobile])).rows[0];
      if (!rider) {
        const code = await nextCode();
        rider = (await client.query(
          `INSERT INTO ${S}.riders (rider_code, name, nickname, mobile, aadhaar, rental_mode, status, assigned_hub_id, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,'weekly','active',$6,'Amit',$7) RETURNING id`,
          [code, name, nick, mobile, "AADHAAR-" + mobile, hub, date + "T00:00:00+05:30"])).rows[0];
        created++;
        console.log(`  + created rider ${code} ${name}`);
      }
      // re-allot the vehicle: close any active assignment on it
      await client.query(`UPDATE ${S}.rider_vehicle_assignments SET status='returned', returned_date=$1 WHERE vehicle_id=$2 AND status='active'`, [date, v.id]);
      // new active assignment
      await client.query(
        `INSERT INTO ${S}.rider_vehicle_assignments (rider_id, vehicle_id, hub_id, assigned_date, status, daily_rent)
         VALUES ($1,$2,$3,$4,'active',$5)`, [rider.id, v.id, hub, date, daily]);
      await client.query(`UPDATE ${S}.vehicles SET status='assigned', hub_id=COALESCE(hub_id,$1) WHERE id=$2`, [hub, v.id]);
      await client.query(`UPDATE ${S}.riders SET status='active' WHERE id=$1`, [rider.id]);
      assigned++;
    }

    // regenerate rent_dues
    const today = istToday();
    const asg = await client.query(`SELECT id, to_char(assigned_date,'YYYY-MM-DD') ad, to_char(returned_date,'YYYY-MM-DD') rd, rider_id, vehicle_id, daily_rent FROM ${S}.rider_vehicle_assignments`);
    let dues = 0;
    for (const a of asg.rows) {
      await client.query(`DELETE FROM ${S}.rent_dues WHERE assignment_id=$1`, [a.id]);
      const cutoff = a.rd ? new Date(a.rd + "T00:00:00Z") : addDays(iso(today), 1);
      const amount = Number(a.daily_rent) * 7;
      let wk = 1;
      for (let ps = new Date(a.ad + "T00:00:00Z"); ps < cutoff; ps.setUTCDate(ps.getUTCDate() + 7), wk++) {
        const pe = new Date(ps); pe.setUTCDate(pe.getUTCDate() + 6);
        await client.query(`INSERT INTO ${S}.rent_dues (assignment_id, rider_id, vehicle_id, week_no, period_start, period_end, due_date, amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [a.id, a.rider_id, a.vehicle_id, wk, iso(ps), iso(pe), iso(pe), amount]);
        dues++;
      }
    }
    await client.query("COMMIT");
    console.log(`\n✅ Riders created: ${created} | Assignments added: ${assigned} | Dues regenerated: ${dues}`);
  } catch (e) { await client.query("ROLLBACK"); console.error("❌ ROLLBACK:", e.message); process.exit(1); }
  finally { await client.end(); }
}
run();
