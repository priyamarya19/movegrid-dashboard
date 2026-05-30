const { Client } = require("pg");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("=");
  if (k && k.trim()) a[k.trim()] = v.join("=").trim();
  return a;
}, {});

const client = new Client({
  host: env.RDS_HOST, port: Number(env.RDS_PORT),
  user: env.RDS_USER, password: env.RDS_PASSWORD,
  database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
});

const S = "mg_data_uat";

// ── New vehicle models ────────────────────────────────────────────
const NEW_MODELS = [
  { model_name: "EV Juno MB", oem: "EV Juno", is_high_speed: false },
  { model_name: "EV Juno BS", oem: "EV Juno", is_high_speed: false },
];

// ── New vehicles ──────────────────────────────────────────────────
const NEW_VEHICLES = [
  { ev: "MG0426N0030", chassis: "SLY22Z102SC066603", model: "EV Juno MB" },
  { ev: "MG0426N0031", chassis: "SLY22Z102SC066705", model: "EV Juno MB" },
  { ev: "MG0426N0032", chassis: "SLY22Z102SC066702", model: "EV Juno MB" },
  { ev: "MG0426N0033", chassis: "SLY22Z102SC066891", model: "EV Juno MB" },
  { ev: "MG0426N0034", chassis: "SLY22Z102SC066880", model: "EV Juno MB" },
  { ev: "MG0426N0035", chassis: "SLY22Z102SC066882", model: "EV Juno MB" },
  { ev: "MG0426N0036", chassis: "SLY22Z102SC066886", model: "EV Juno MB" },
  { ev: "MG0426N0037", chassis: "SLY22Z102SC066722", model: "EV Juno MB" },
  { ev: "MG0426N0038", chassis: "SLY22Z102SC066905", model: "EV Juno MB" },
  { ev: "MG0426N0039", chassis: "SLY22Z102SC066901", model: "EV Juno MB" },
  { ev: "MG0426N0040", chassis: "NEOAF202500118",    model: "EV Juno MB" },
  { ev: "MG0426N0041", chassis: "SLY22Z101TA900886", model: "EV Juno BS" },
];

// ── New riders ────────────────────────────────────────────────────
const NEW_RIDERS = [
  { code: "MG000024", name: "Pradeep Kumar",     mobile: "9793047488", joined: "2026-05-22", rental_mode: "weekly",  employer: "Blinkit",          security_deposit: 0, onboarding_fee: 1250, status: "active", ev: "MG0426N0027" },
  { code: "MG000025", name: "Sumit Srivastava",  mobile: "8860514433", joined: "2026-05-23", rental_mode: "weekly",  employer: "Swiggy",           security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0040" },
  { code: "MG000026", name: "Sanjay Yadav",      mobile: "7302165388", joined: "2026-05-23", rental_mode: "weekly",  employer: "Blinkit",          security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0033" },
  { code: "MG000027", name: "Gajendra Yadav",    mobile: "7248826582", joined: "2026-05-23", rental_mode: "weekly",  employer: "Blinkit",          security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0031" },
  { code: "MG000028", name: "Ashok Kumar mahto", mobile: "8287755018", joined: "2026-05-23", rental_mode: "weekly",  employer: "Blinkit",          security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0034" },
  { code: "MG000029", name: "Nirbhay Rana",      mobile: "8882777082", joined: "2026-05-23", rental_mode: "weekly",  employer: "Rapido",           security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0035" },
  { code: "MG000030", name: "Prem Singh",        mobile: "7668390241", joined: "2026-05-25", rental_mode: "weekly",  employer: "Blinkit",          security_deposit: 0, onboarding_fee: 1250, status: "active", ev: "MG0426N0028" },
  { code: "MG000031", name: "Pawan",             mobile: "8433020233", joined: "2026-05-25", rental_mode: "weekly",  employer: "Swiggy Instamart", security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0036" },
  { code: "MG000032", name: "Anoj Kumar",        mobile: "8750235022", joined: "2026-05-25", rental_mode: "weekly",  employer: "Jio Mart",         security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0039" },
  { code: "MG000033", name: "Ravi Kumar",        mobile: "9691127984", joined: "2026-05-26", rental_mode: "weekly",  employer: "Zomato",           security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0032" },
  { code: "MG000034", name: "Prince Deep",       mobile: "7061692906", joined: "2026-05-29", rental_mode: "weekly",  employer: "Rapido",           security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0038" },
  { code: "MG000035", name: "Shashank",          mobile: "9235371948", joined: "2026-05-29", rental_mode: "weekly",  employer: "Zepto",            security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0030" },
  { code: "MG000036", name: "Anoop kumar",       mobile: "6392485904", joined: "2026-05-29", rental_mode: "weekly",  employer: "Zepto",            security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0037" },
  { code: "MG000037", name: "Gopal jha",         mobile: "9958744242", joined: "2026-05-29", rental_mode: "weekly",  employer: "Amazon Grocery",   security_deposit: 0, onboarding_fee: 1500, status: "active", ev: "MG0426N0041" },
];

// ── All payments to add (new + missing for existing riders) ───────
// Format: [mobile, payment_date, amount]
// ON CONFLICT DO NOTHING handles duplicates safely
const NEW_PAYMENTS = [
  // ── Existing riders — missing payments ─────────────────────────
  ["8587971484", "2026-05-18", 1610],  // Altaf       MG000003 week 3
  ["7065508843", "2026-05-21", 1610],  // Anand Kumar MG000007 week 3
  ["7065508843", "2026-05-28", 1610],  // Anand Kumar MG000007 week 4
  ["7818838273", "2026-05-18", 1610],  // Harshit     MG000010 week 3
  ["9839859086", "2026-05-22", 1000],  // Rinku       MG000011 partial
  ["8796918758", "2026-05-19", 1610],  // Rambabu     MG000012 week 3
  ["9927186055", "2026-05-19", 1610],  // Bharat      MG000013 week 3
  ["8882973803", "2026-05-19", 1610],  // Rohit Sharma MG000014 week 3
  ["9582912949", "2026-05-19", 1610],  // Ghanshyam   MG000015 week 3
  ["9540316410", "2026-05-20", 1610],  // Sunil       MG000017 week 3
  ["9548396560", "2026-05-20", 1610],  // Rahul       MG000018 week 3
  ["8193841808", "2026-05-20", 1610],  // Lakiraj     MG000019 week 3
  ["9870164936", "2026-05-20", 1610],  // Abhishek    MG000020 week 3
  ["7054098911", "2026-05-20", 1610],  // Arun Kumar  MG000021 week 3

  // ── New riders ─────────────────────────────────────────────────
  ["9793047488", "2026-05-29", 1610],  // Pradeep     MG000024 week 1
  ["8860514433", "2026-05-30", 1680],  // Sumit       MG000025 week 1
  ["7302165388", "2026-05-30", 1680],  // Sanjay      MG000026 week 1
  ["7248826582", "2026-05-30", 1680],  // Gajendra    MG000027 week 1
  ["8287755018", "2026-05-30", 1680],  // Ashok       MG000028 week 1
  ["8882777082", "2026-05-30", 1680],  // Nirbhay     MG000029 week 1
  ["7668390241", "2026-06-01", 1610],  // Prem        MG000030 week 1
  ["8433020233", "2026-06-01", 1680],  // Pawan       MG000031 week 1
  ["8750235022", "2026-06-01", 1680],  // Anoj        MG000032 week 1
  ["9691127984", "2026-06-02", 1680],  // Ravi        MG000033 week 1
  ["7061692906", "2026-06-05", 1820],  // Prince      MG000034 week 1
  ["9235371948", "2026-06-05", 1820],  // Shashank    MG000035 week 1
  ["6392485904", "2026-06-05", 1820],  // Anoop       MG000036 week 1
  ["9958744242", "2026-06-05", 1680],  // Gopal       MG000037 week 1
];

async function run() {
  await client.connect();
  console.log("Connected\n");
  await client.query("BEGIN");

  try {
    // 1. Get hub ID
    const hubRes = await client.query(`SELECT id FROM ${S}.hubs WHERE hub_name = 'Noida-122' LIMIT 1`);
    if (!hubRes.rows[0]) throw new Error("Hub Noida-122 not found — run import-riders.js first");
    const hubId = hubRes.rows[0].id;

    // 2. Ensure vehicle models exist
    const modelMap = {};
    for (const m of NEW_MODELS) {
      const existing = await client.query(`SELECT id FROM ${S}.vehicle_models WHERE model_name = $1`, [m.model_name]);
      if (existing.rows[0]) {
        modelMap[m.model_name] = existing.rows[0].id;
        console.log(`  Model exists: ${m.model_name}`);
      } else {
        const r = await client.query(
          `INSERT INTO ${S}.vehicle_models (model_name, oem, rental_per_day, is_high_speed) VALUES ($1,$2,0,$3) RETURNING id`,
          [m.model_name, m.oem, m.is_high_speed]
        );
        modelMap[m.model_name] = r.rows[0].id;
        console.log(`  Created model: ${m.model_name}`);
      }
    }
    // Also get existing Shelby model
    const shelbyRes = await client.query(`SELECT id FROM ${S}.vehicle_models WHERE model_name ILIKE 'shelby%' LIMIT 1`);
    if (shelbyRes.rows[0]) modelMap["Shelby BS"] = shelbyRes.rows[0].id;

    // 3. Ensure vehicles exist
    const vehicleMap = {};
    // Get existing vehicles first
    const existingVehicles = await client.query(`SELECT id, ev_number FROM ${S}.vehicles`);
    existingVehicles.rows.forEach(v => { vehicleMap[v.ev_number] = v.id; });

    for (const v of NEW_VEHICLES) {
      if (vehicleMap[v.ev]) {
        console.log(`  Vehicle exists: ${v.ev}`);
        continue;
      }
      const mId = modelMap[v.model];
      if (!mId) throw new Error(`No model ID found for ${v.model}`);
      const r = await client.query(
        `INSERT INTO ${S}.vehicles (ev_number, chassis_number, model_id, hub_id, status) VALUES ($1,$2,$3,$4,'assigned') RETURNING id`,
        [v.ev, v.chassis, mId, hubId]
      );
      vehicleMap[v.ev] = r.rows[0].id;
      console.log(`  Created vehicle: ${v.ev}`);
    }
    console.log(`\nVehicles ready`);

    // 4. Get existing rider mobile→id map
    const riderRows = await client.query(`SELECT id, mobile FROM ${S}.riders`);
    const riderMap = {};
    riderRows.rows.forEach(r => { riderMap[r.mobile] = r.id; });

    // 5. Insert new riders
    let newRiderCount = 0;
    for (const r of NEW_RIDERS) {
      if (riderMap[r.mobile]) {
        console.log(`  Rider exists: ${r.name}`);
        continue;
      }
      const res = await client.query(`
        INSERT INTO ${S}.riders (
          rider_code, name, mobile, aadhaar, rental_mode, business_type, employer,
          onboarding_fee, security_deposit, assigned_hub_id, status, created_at, created_by
        ) VALUES ($1,$2,$3,$4,$5,'rental',$6,$7,$8,$9,$10,$11,'priyam@movegrid.in') RETURNING id`,
        [r.code, r.name, r.mobile, "AADHAAR-" + r.mobile, r.rental_mode, r.employer,
         r.onboarding_fee, r.security_deposit, hubId, r.status,
         r.joined + "T00:00:00+05:30"]
      );
      riderMap[r.mobile] = res.rows[0].id;
      newRiderCount++;
      console.log(`  Created rider: ${r.code} ${r.name}`);

      // Vehicle assignment
      const vId = vehicleMap[r.ev];
      if (vId) {
        // Mark previous assignment for this vehicle as returned
        await client.query(
          `UPDATE ${S}.rider_vehicle_assignments SET status = 'returned' WHERE vehicle_id = $1 AND status = 'active'`,
          [vId]
        );
        await client.query(
          `INSERT INTO ${S}.rider_vehicle_assignments (rider_id, vehicle_id, hub_id, status, assigned_date) VALUES ($1,$2,$3,'active',$4)`,
          [riderMap[r.mobile], vId, hubId, r.joined]
        );
      }
    }
    console.log(`\nNew riders added: ${newRiderCount}`);

    // 6. Insert payments (ON CONFLICT skip duplicates)
    // Add unique constraint check: use date+rider combo
    let payCount = 0, skipCount = 0;
    for (const [mobile, dateStr, amount] of NEW_PAYMENTS) {
      const riderId = riderMap[mobile];
      if (!riderId) { console.warn(`  WARN: no rider for ${mobile}`); continue; }

      // Check if payment on this date already exists for this rider
      const exists = await client.query(
        `SELECT 1 FROM ${S}.rider_payments WHERE rider_id = $1 AND payment_date::date = $2::date`,
        [riderId, dateStr]
      );
      if (exists.rows[0]) { skipCount++; continue; }

      const d = new Date(dateStr);
      const ps = new Date(d); ps.setDate(d.getDate() - 6);
      const periodStart = ps.toISOString().split("T")[0];

      await client.query(
        `INSERT INTO ${S}.rider_payments (rider_id, amount_collected, payment_date, rental_period_start, rental_period_end) VALUES ($1,$2,$3,$4,$5)`,
        [riderId, amount, dateStr, periodStart, dateStr]
      );
      payCount++;
    }
    console.log(`Payments added: ${payCount}, skipped (already exist): ${skipCount}`);

    await client.query("COMMIT");
    console.log("\n✅ Done!\n");

    // Verify
    const [riders, payments, vehicles] = await Promise.all([
      client.query(`SELECT COUNT(*) FROM ${S}.riders`),
      client.query(`SELECT COUNT(*) FROM ${S}.rider_payments`),
      client.query(`SELECT COUNT(*) FROM ${S}.vehicles`),
    ]);
    console.log(`Riders: ${riders.rows[0].count}`);
    console.log(`Payments: ${payments.rows[0].count}`);
    console.log(`Vehicles: ${vehicles.rows[0].count}`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
