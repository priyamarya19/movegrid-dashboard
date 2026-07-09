// Ops-sheet update (2026-07-09): three independent fixes bundled together.
//  1. Onboard Sonu Yadav — new rider + new vehicle (MG0426N0061) + assignment.
//  2. Record 4 riders' rent payments the sheet shows as collected but the DB is missing
//     (Rajat Singh, Rohit Sharma, Mohit Pal x2 weeks, Mohd Danish).
//  3. Process Mohammad Ali's vehicle return (submitted 07/07, never applied — his
//     assignment was still 'active') + his penalty, same pattern as import-submissions.mjs.
// DRY_RUN default; DRY_RUN=0 to commit. Run add-paid-through-date.js after applying.
import fs from "fs"; import pg from "pg";
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => { const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a; }, {});
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";
const DRY = process.env.DRY_RUN !== "0";
const c = new pg.Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const dg = s => (s || "").replace(/\D/g, "");
const NXTE = "9b5ed602-97ff-4556-8167-373e020778b0", HUB = "fc9f895e-92f4-4b8a-8630-63aea595f72b";

const sonuVehicle = { ev: "MG0426N0061", ch: "NXTMOB202511V6171", bat: "TK514531HW002287", mo: "NXTBA202511M6139", co: "NXTE-C2", imei: null };
const sonuRider = {
  name: "Sonu Yadav", nickname: "Sonu", mob: "6355816513",
  addr: "Peer chowk Sarfabad sector 73 Noida",
  map: "https://maps.google.com/maps?q=H9PJ%2BMQP%2C%2BSarfabad%2BVillage%2C%2BSarfabad%2C%2BSector%2B73%2C%2BNoida%2C%2BUttar%2BPradesh%2B201316%2C%2BIndia",
  frn: "Sumitra", frm: "9758529274", lrn: "Praveen", lrm: "8700823227",
  af: "https://drive.google.com/open?id=1HseK4KNsyEThH7gxBcRgro1kylfxqdoD",
  ab: "https://drive.google.com/open?id=1gECox_mDWNVHuxxbRM4WadDVckBGaTnw",
  pan: "https://drive.google.com/open?id=1fJHcj3ziKLER7GXyjDlajQzpYbF1jlvq",
  bankDoc: "https://drive.google.com/open?id=1HcFFOM6V-vb6thaff2ijsRY74R1fSkYV",
  faad: "https://drive.google.com/open?id=1xcHgseJh7wTmJ0zDtD4j-IVODXenHlTX",
};
const sonuAssignment = { mob: "6355816513", ev: "MG0426N0061", date: "2026-07-09", by: "Ajay", amt: 3320 };

// [mobile, weekly payments as [periodStart, periodEnd, amount]]
const newPayments = [
  { mob: "9058439061", name: "Rajat Singh", weeks: [["2026-06-11", "2026-06-17", 1680]] },
  { mob: "8882973803", name: "Rohit Sharma", weeks: [["2026-07-07", "2026-07-13", 1680]] },
  { mob: "8447063784", name: "Mohit pal", weeks: [["2026-06-29", "2026-07-05", 1680], ["2026-07-06", "2026-07-12", 1680]] },
  { mob: "7820015194", name: "Mohd Danish", weeks: [["2026-07-07", "2026-07-13", 1680]] },
];

const mohammadAli = { mob: "9568080124", ev: "MG0426N0039", penalty: "2500+300=2800", cond: "Any other issue", sub: "2026-07-07", remarks: "Main dask, Head light mirror, Head light decoration, tool box", by: "Amit", rentPaid: "No" };
const penAmt = s => { if (s.includes("=")) return parseInt(s.split("=").pop().replace(/\D/g, "")); const nums = (s.match(/\d+/g) || []).map(Number); return nums.length ? nums.reduce((a, b) => a + b, 0) : null; };

async function run() {
  await c.connect(); console.log(`\n== ${DRY ? "DRY RUN" : "APPLY"} on ${S} ==\n`);
  await c.query("BEGIN");
  try {
    // 1. Sonu Yadav onboarding
    console.log("--- 1. Onboard Sonu Yadav ---");
    let vid = (await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`, [sonuVehicle.ev])).rows[0]?.id;
    if (vid) console.log(`vehicle ${sonuVehicle.ev} exists — skip`);
    else {
      vid = (await c.query(`INSERT INTO ${S}.vehicles (ev_number,chassis_number,motor_number,controller_number,battery_number,battery_partner,iot_imei,iot_partner,model_id,hub_id,status)
        VALUES ($1,$2,$3,$4,$5,'Mooving',$6,'Fixx ev/Loconav',$7,$8,'assigned') RETURNING id`,
        [sonuVehicle.ev, sonuVehicle.ch, sonuVehicle.mo, sonuVehicle.co, sonuVehicle.bat, sonuVehicle.imei, NXTE, HUB])).rows[0].id;
      console.log(`  vehicle ${sonuVehicle.ev} created`);
    }
    let rid = (await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1`, [dg(sonuRider.mob)])).rows[0]?.id;
    if (rid) console.log(`rider ${sonuRider.name} exists — skip`);
    else {
      const next = (await c.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(rider_code FROM 3) AS INT)),0)+1 n FROM ${S}.riders`)).rows[0].n;
      const code = "MG" + String(next).padStart(6, "0");
      rid = (await c.query(`INSERT INTO ${S}.riders (rider_code,name,nickname,mobile,current_address,address_map_link,family_ref_name,family_ref_mobile,local_ref_name,local_ref_mobile,
        aadhaar_front_url,aadhaar_back_url,pan_image_url,bank_doc_url,family_ref_aadhaar_url,rental_mode,business_type,assigned_hub_id,status,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'weekly','rental',$16,'active','Ajay') RETURNING id`,
        [code, sonuRider.name, sonuRider.nickname, sonuRider.mob, sonuRider.addr, sonuRider.map, sonuRider.frn, sonuRider.frm, sonuRider.lrn, sonuRider.lrm,
         sonuRider.af, sonuRider.ab, sonuRider.pan, sonuRider.bankDoc, sonuRider.faad, HUB])).rows[0].id;
      console.log(`  rider ${sonuRider.name} -> ${code}`);
    }
    const dupAsg = (await c.query(`SELECT id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND vehicle_id=$2 AND assigned_date=$3`, [rid, vid, sonuAssignment.date])).rows[0];
    if (dupAsg) console.log("assignment exists — skip");
    else {
      await c.query(`INSERT INTO ${S}.rider_vehicle_assignments (rider_id,vehicle_id,hub_id,assigned_date,status,daily_rent,amount_collected,allotted_by)
        VALUES ($1,$2,$3,$4,'active',260,$5,$6)`, [rid, vid, HUB, sonuAssignment.date, sonuAssignment.amt, sonuAssignment.by]);
      console.log("  assignment created");
    }

    // 2. Missing rent payments
    console.log("\n--- 2. Record missing rent payments ---");
    for (const p of newPayments) {
      const row = (await c.query(`SELECT r.id rider_id, a.vehicle_id FROM ${S}.rider_vehicle_assignments a JOIN ${S}.riders r ON r.id=a.rider_id
        WHERE regexp_replace(r.mobile,'\\D','','g')=$1 AND a.status='active'`, [dg(p.mob)])).rows[0];
      if (!row) { console.log(`⚠️ ${p.name}: no active assignment found — skip`); continue; }
      for (const [ps, pe, amt] of p.weeks) {
        const dup = (await c.query(`SELECT id FROM ${S}.rider_payments WHERE rider_id=$1 AND vehicle_id=$2 AND rental_period_start=$3`, [row.rider_id, row.vehicle_id, ps])).rows[0];
        if (dup) { console.log(`  ${p.name}: payment for ${ps}..${pe} exists — skip`); continue; }
        await c.query(`INSERT INTO ${S}.rider_payments (rider_id,vehicle_id,amount_collected,payment_date,rental_period_start,rental_period_end)
          VALUES ($1,$2,$3,$4,$5,$6)`, [row.rider_id, row.vehicle_id, amt, pe, ps, pe]);
        console.log(`  ${p.name}: +₹${amt} for ${ps}..${pe}`);
      }
    }

    // 3. Mohammad Ali return + penalty
    console.log("\n--- 3. Mohammad Ali return ---");
    const aliVid = (await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`, [mohammadAli.ev])).rows[0]?.id;
    const aliAsg = (await c.query(`SELECT a.id, a.rider_id, a.status FROM ${S}.rider_vehicle_assignments a JOIN ${S}.riders r ON r.id=a.rider_id
      WHERE regexp_replace(r.mobile,'\\D','','g')=$1 AND a.vehicle_id=$2`, [dg(mohammadAli.mob), aliVid])).rows[0];
    if (!aliAsg) console.log("⚠️ Mohammad Ali assignment not found — skip");
    else if (aliAsg.status === "returned") console.log("already returned — skip");
    else {
      const condArr = mohammadAli.cond.split(",").map(s => s.trim()).filter(Boolean);
      await c.query(`UPDATE ${S}.rider_vehicle_assignments SET status='returned', returned_date=$1, return_remarks=$2, condition_on_return=$3, rent_cleared=$4, returned_by=$5 WHERE id=$6`,
        [mohammadAli.sub, mohammadAli.remarks, condArr, mohammadAli.rentPaid === "Yes", mohammadAli.by, aliAsg.id]);
      await c.query(`UPDATE ${S}.vehicles SET status='available' WHERE id=$1`, [aliVid]);
      await c.query(`UPDATE ${S}.riders SET status='inactive' WHERE id=$1`, [aliAsg.rider_id]);
      console.log("  assignment marked returned, vehicle -> available, rider -> inactive");
      const pen = penAmt(mohammadAli.penalty);
      const dupPen = (await c.query(`SELECT id FROM ${S}.rider_penalties WHERE assignment_id=$1`, [aliAsg.id])).rows[0];
      if (dupPen) console.log("  penalty already recorded — skip");
      else {
        await c.query(`INSERT INTO ${S}.rider_penalties (rider_id,vehicle_id,assignment_id,amount,detail,status,created_by,created_at)
          VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`, [aliAsg.rider_id, aliVid, aliAsg.id, pen, mohammadAli.penalty, mohammadAli.by, mohammadAli.sub]);
        console.log(`  penalty recorded: ₹${pen}`);
      }
    }

    console.log("\n--- summary ---");
    console.log(JSON.stringify((await c.query(`SELECT (SELECT count(*)::int FROM ${S}.vehicles) v,(SELECT count(*)::int FROM ${S}.riders) r,(SELECT count(*)::int FROM ${S}.rider_vehicle_assignments) a,(SELECT count(*)::int FROM ${S}.rider_payments) p,(SELECT count(*)::int FROM ${S}.rider_penalties) pen`)).rows[0]));

    if (DRY) { await c.query("ROLLBACK"); console.log("\n🔎 DRY RUN — rolled back."); }
    else { await c.query("COMMIT"); console.log("\n✅ COMMITTED to " + S); }
  } catch (e) { await c.query("ROLLBACK"); console.error("❌ ROLLBACK:", e.message); process.exit(1); } finally { await c.end(); }
}
run();
