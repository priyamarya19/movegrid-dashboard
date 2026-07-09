// Sync the weekly rent ledger sheet into the system (UAT).
//  - match rider by MOBILE (+ allotment date for re-joins)
//  - first "Submitted" week => effective return (cycle stops there)
//  - "Collected" week => record a payment (skipped if one already exists for that week)
//  - "Pending"/blank => left owed
//  - regenerate rent_dues afterwards
// status string per rider weeks 1..11: C=Collected, S=Submitted(returned), P=Pending, .=blank
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a; }, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = "mg_data_uat";

// [mobile, onboard YYYY-MM-DD, status]
const L = [
  ["7505022678","2026-04-25","SSSSSSSSSSS"],["8860794603","2026-04-26","CCCCCCCP..."],["8587971484","2026-04-27","CCCCCCSSS.."],
  ["7379146745","2026-04-29","CCCCCPPP..."],["9027145129","2026-04-29","CCCCPPPP..."],["9058439061","2026-04-30","CCCCCPP...."],
  ["7065508843","2026-04-30","CCCCCCCP..."],["7818823128","2026-04-30","CCSSSSSSSSS"],["9559326761","2026-05-03","CSSSSSSSSSS"],
  ["7818838273","2026-05-04","CCSSSSSSSSS"],["9839859086","2026-05-04","CCCCPP....."],["8796918758","2026-05-05","CCCCCP....."],
  ["9927186055","2026-05-05","CCSSSS....."],["8882973803","2026-05-05","CCCCCCC...."],["9582912949","2026-05-05","CCCCCCP...."],
  ["6397101738","2026-05-05","SSSSSSSSSSS"],["9540316410","2026-05-05","CCCCPP....."],["9548396560","2026-05-06","CCCCSSSSSSS"],
  ["8193841808","2026-05-06","CCCCCPS...."],["9870164936","2026-05-06","CCSSSSSSSSS"],["7054098911","2026-05-06","CCCCCCC...."],
  ["9088230421","2026-05-14","CCCCP......"],["9639610457","2026-05-19","CCCCC......"],["9793047488","2026-05-22","CCCCP......"],
  ["8860514433","2026-05-23","CCPP......."],["7302165388","2026-05-23","CSSSSSSSSSS"],["7248826582","2026-05-23","CCSSSSSSSSS"],
  ["8287755018","2026-05-23","CCCCSSSSSSS"],["8882777082","2026-05-23","CCPP......."],["7668390241","2026-05-25","CCCCSSSSSSS"],
  ["8433020233","2026-05-25","CSSSSSSSSSS"],["8750235022","2026-05-25","CSSSSSSSSSS"],["9691127984","2026-05-26","CCCP......."],
  ["7061692906","2026-05-29","CPP........"],["9235371948","2026-05-29","CCCP......."],["6392485904","2026-05-29","CCC........"],
  ["9958744242","2026-05-29","CSSSSSSSSSS"],["7393872559","2026-06-01","CSSSSSSSSSS"],["8766334246","2026-06-01","CCS........"],
  ["9643636941","2026-06-01","CCP........"],["6398077228","2026-06-01","CCC........"],["9927186055","2026-06-02","SSSSSSSSSSS"],
  ["7451024910","2026-06-03","CPP........"],["9355560897","2026-06-03","CPP........"],["7292011287","2026-06-03","CPP........"],
  ["8840535672","2026-06-05","CCP........"],["9974207270","2026-06-06","CCP........"],["8115387509","2026-06-09","SSSSSSSSSSS"],
  ["7982212139","2026-06-10","SSSSSSSSSSS"],["7319845124","2026-06-11","CP........."],["8528297800","2026-06-15","P.........."],
  ["8447063784","2026-06-15","CP........."],["9560759578","2026-06-17","CSSSSSSSSSS"],["9355676982","2026-06-18","P.........."],
  ["9548396560","2026-06-18","SSSSSSSSSSS"],["8439616892","2026-06-19","P.........."],["8510988713","2026-06-20","P.........."],
  ["7820015194","2026-06-23","P.........."],["9568080124","2026-06-23","P.........."],["9956661380","2026-06-24","P.........."],
];

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const istToday = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };

async function run() {
  await client.connect();
  await client.query("BEGIN");
  try {
    let returns = 0, payments = 0, skipped = [];
    for (const [mobile, onb, status] of L) {
      const r = await client.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g') = $1 LIMIT 1`, [mobile]);
      if (!r.rows[0]) { skipped.push(`${mobile} (no rider)`); continue; }
      const riderId = r.rows[0].id;
      const asgs = await client.query(`SELECT id, to_char(assigned_date,'YYYY-MM-DD') ad, daily_rent, vehicle_id FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1`, [riderId]);
      if (!asgs.rows[0]) { skipped.push(`${mobile} (no assignment)`); continue; }
      // pick assignment whose assigned_date is closest to the sheet onboard date (handles re-joins)
      const onT = new Date(onb + "T00:00:00Z").getTime();
      const a = asgs.rows.sort((x, y) => Math.abs(new Date(x.ad).getTime() - onT) - Math.abs(new Date(y.ad).getTime() - onT))[0];
      const rate = Number(a.daily_rent) || 0;

      const firstS = status.indexOf("S");
      if (firstS >= 0) {
        const ret = iso(addDays(a.ad, 7 * firstS)); // week (firstS+1) starts here -> excluded
        await client.query(`UPDATE ${S}.rider_vehicle_assignments SET returned_date = $1, status = 'returned' WHERE id = $2`, [ret, a.id]);
        returns++;
      }
      // record Collected weeks (only those before the return), dedup by existing payment in the week
      for (let k = 0; k < status.length; k++) {
        if (status[k] !== "C") continue;
        if (firstS >= 0 && k >= firstS) continue;
        const ps = iso(addDays(a.ad, 7 * k)), pe = iso(addDays(a.ad, 7 * k + 6));
        const ex = await client.query(`SELECT 1 FROM ${S}.rider_payments WHERE rider_id = $1 AND (payment_date BETWEEN $2 AND $3 OR rental_period_start BETWEEN $2 AND $3) LIMIT 1`, [riderId, ps, pe]);
        if (ex.rows[0]) continue;
        await client.query(`INSERT INTO ${S}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end) VALUES ($1,$2,$3,$4,$5,$6)`, [riderId, a.vehicle_id, rate * 7, pe, ps, pe]);
        payments++;
      }
    }

    // mark riders inactive if they have no active assignment
    await client.query(`UPDATE ${S}.riders SET status='inactive' WHERE status='active' AND NOT EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id = riders.id AND a.status='active')`);

    // regenerate rent_dues from updated assignments
    const today = istToday();
    const asg = await client.query(`SELECT id, to_char(assigned_date,'YYYY-MM-DD') ad, to_char(returned_date,'YYYY-MM-DD') rd, rider_id, vehicle_id, daily_rent FROM ${S}.rider_vehicle_assignments`);
    let dues = 0;
    for (const a of asg.rows) {
      await client.query(`DELETE FROM ${S}.rent_dues WHERE assignment_id = $1`, [a.id]);
      const start = new Date(a.ad + "T00:00:00Z");
      const cutoff = a.rd ? new Date(a.rd + "T00:00:00Z") : addDays(iso(today), 1);
      const amount = Number(a.daily_rent) * 7;
      let wk = 1;
      for (let ps = new Date(start); ps < cutoff; ps.setUTCDate(ps.getUTCDate() + 7), wk++) {
        const pe = new Date(ps); pe.setUTCDate(pe.getUTCDate() + 6);
        const due = new Date(ps); due.setUTCDate(due.getUTCDate() - 1); // rent in advance: due = day before cycle start
        await client.query(`INSERT INTO ${S}.rent_dues (assignment_id, rider_id, vehicle_id, week_no, period_start, period_end, due_date, amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [a.id, a.rider_id, a.vehicle_id, wk, iso(ps), iso(pe), iso(due), amount]);
        dues++;
      }
    }

    await client.query("COMMIT");
    console.log(`✅ Returns set: ${returns} | Payments recorded: ${payments} | Dues regenerated: ${dues}`);
    if (skipped.length) console.log("Skipped (not in DB):\n  " + skipped.join("\n  "));
  } catch (e) { await client.query("ROLLBACK"); console.error("❌ ROLLBACK:", e.message); process.exit(1); }
  finally { await client.end(); }
}
run();
