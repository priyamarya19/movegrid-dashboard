const { Client } = require("pg");

const client = new Client({
  host: "movegrid-db.c9sk6imw8t1h.ap-south-1.rds.amazonaws.com",
  port: 5432,
  user: "movegrid_admin",
  password: "MayusMina007",
  database: "movegrid",
  ssl: { rejectUnauthorized: false },
});

const S = "uat_ops";

const RIDERS = [
  { name: "Rohit Kumar",          mobile: "7505022678", joined: "2026-04-25", rental_mode: "monthly", swap_cycle: "monthly", swap_quota: 48, employer: "Zepto",            security_deposit: 500, onboarding_fee: 1500, status: "inactive", ev: "MG0426N0010" },
  { name: "Ajay Sharma",           mobile: "8860794603", joined: "2026-04-26", rental_mode: "monthly", swap_cycle: "monthly", swap_quota: 50, employer: "Personal Use",     security_deposit: 500, onboarding_fee: 1500, status: "active",   ev: "MG0426N0014" },
  { name: "Altaf",                 mobile: "8587971484", joined: "2026-04-27", rental_mode: "monthly", swap_cycle: "monthly", swap_quota: 50, employer: "Amazon Grocery",   security_deposit: 500, onboarding_fee: 1500, status: "active",   ev: "MG0426N0020" },
  { name: "Vinit kumar tiwari",    mobile: "7379146745", joined: "2026-04-29", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Zepto",            security_deposit: 0,   onboarding_fee: 1000, status: "active",   ev: "MG0426N0024" },
  { name: "Suraj",                 mobile: "9027145129", joined: "2026-04-29", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0029" },
  { name: "Rajat Singh",           mobile: "9058439061", joined: "2026-04-30", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0026" },
  { name: "Anand Kumar",           mobile: "7065508843", joined: "2026-04-30", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Amazon Grocery",   security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0025" },
  { name: "Aas mohammad",          mobile: "7818823128", joined: "2026-04-30", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Flipkart",         security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0027" },
  { name: "Shiva Sharma",          mobile: "9559326761", joined: "2026-05-03", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "inactive", ev: "MG0426N0012" },
  { name: "Harshit yadav",         mobile: "7818838273", joined: "2026-05-04", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0013" },
  { name: "Rinku",                 mobile: "9839859086", joined: "2026-05-04", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0015" },
  { name: "Rambabu prasad",        mobile: "8796918758", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Swiggy Instamart", security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0011" },
  { name: "Bharat Singh",          mobile: "9927186055", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0028" },
  { name: "Rohit Sharma",          mobile: "8882973803", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Amazon Grocery",   security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0016" },
  { name: "Ghanshyam Murari",      mobile: "9582912949", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "BB Now",           security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0017" },
  { name: "Vipul Anand",           mobile: "6397101738", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Swiggy Instamart", security_deposit: 0,   onboarding_fee: 1250, status: "inactive", ev: "MG0426N0019" },
  { name: "Sunil",                 mobile: "9540316410", joined: "2026-05-05", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Zepto",            security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0010" },
  { name: "Rahul Kumar",           mobile: "9548396560", joined: "2026-05-06", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0023" },
  { name: "Lakiraj",               mobile: "8193841808", joined: "2026-05-06", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0022" },
  { name: "Abhishek",              mobile: "9870164936", joined: "2026-05-06", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Amazon Grocery",   security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0018" },
  { name: "Arun Kumar",            mobile: "7054098911", joined: "2026-05-06", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Zepto",            security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0021" },
  { name: "Ritwik kumar pandey",   mobile: "9088230421", joined: "2026-05-14", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Amazon",           security_deposit: 0,   onboarding_fee: 1250, status: "active",   ev: "MG0426N0019" },
  { name: "Ankesh kumar",          mobile: "9639610457", joined: "2026-05-19", rental_mode: "weekly",  swap_cycle: "weekly",  swap_quota: 12, employer: "Blinkit",          security_deposit: 0,   onboarding_fee: 1500, status: "active",   ev: "MG0426N0012" },
];

const EV_NUMBERS = [...new Set(RIDERS.map(r => r.ev))];

// Riders who originally had an EV but returned it (their record has status=inactive)
// The same EV was later given to another rider
const RETURNED_EVS = new Set(["MG0426N0010", "MG0426N0012", "MG0426N0019"]);

// [mobile, payment_date, amount]
const PAYMENTS = [
  // April
  ["7505022678", "2026-04-25", 1610], ["8860794603", "2026-04-26", 1610],
  ["8587971484", "2026-04-27", 1610], ["7379146745", "2026-04-29", 1610],
  ["9027145129", "2026-04-29", 1610], ["9058439061", "2026-04-30", 1610],
  ["7065508843", "2026-04-30", 1610], ["7818823128", "2026-04-30", 1610],
  // May
  ["8860794603", "2026-05-03", 1610], ["9559326761", "2026-05-03", 1610],
  ["8587971484", "2026-05-04", 1610], ["7818838273", "2026-05-04", 1610],
  ["9839859086", "2026-05-04", 1610], ["8796918758", "2026-05-05", 1610],
  ["9927186055", "2026-05-05", 1610], ["8882973803", "2026-05-05", 1610],
  ["9582912949", "2026-05-05", 1610], ["9540316410", "2026-05-05", 1610],
  ["9058439061", "2026-05-06", 1610], ["7065508843", "2026-05-06", 1610],
  ["7818823128", "2026-05-06", 1610], ["9548396560", "2026-05-06", 1610],
  ["8193841808", "2026-05-06", 1610], ["9870164936", "2026-05-06", 1610],
  ["7054098911", "2026-05-06", 1610], ["8860794603", "2026-05-09", 1610],
  ["8587971484", "2026-05-11", 1610], ["9559326761", "2026-05-11", 1610],
  ["7818838273", "2026-05-11", 1610], ["9839859086", "2026-05-11", 1610],
  ["8796918758", "2026-05-12", 1610], ["9927186055", "2026-05-12", 1610],
  ["8882973803", "2026-05-12", 1610], ["9582912949", "2026-05-12", 1610],
  ["7379146745", "2026-05-13",  920], ["9540316410", "2026-05-13", 1410],
  ["9548396560", "2026-05-13", 1610], ["8193841808", "2026-05-13", 1610],
  ["9870164936", "2026-05-13", 1610], ["7054098911", "2026-05-13", 1610],
  ["9058439061", "2026-05-14", 1650], ["7065508843", "2026-05-14", 1610],
  ["7818823128", "2026-05-14", 1610], ["9088230421", "2026-05-14", 1610],
  ["8860794603", "2026-05-16", 1680], ["9559326761", "2026-05-17",  460],
  ["9839859086", "2026-05-18", 1020], ["8796918758", "2026-05-19", 1610],
  ["8882973803", "2026-05-19", 1610], ["9582912949", "2026-05-19", 1610],
  ["9540316410", "2026-05-19", 1610], ["9639610457", "2026-05-20", 1610],
];

async function run() {
  await client.connect();
  console.log("Connected to DB\n");
  await client.query("BEGIN");

  try {
    // 1. Vehicle model (no unique constraint, so check first)
    let modelId;
    const existingModel = await client.query(`SELECT id FROM ${S}.vehicle_models WHERE model_name = $1`, ["Shelby"]);
    if (existingModel.rows[0]) {
      modelId = existingModel.rows[0].id;
      console.log("Vehicle model Shelby already exists:", modelId);
    } else {
      const modelRes = await client.query(
        `INSERT INTO ${S}.vehicle_models (model_name, oem, rental_per_day, is_high_speed) VALUES ($1,$2,0,false) RETURNING id`,
        ["Shelby", "Shelby"]
      );
      modelId = modelRes.rows[0].id;
      console.log("Created vehicle model Shelby:", modelId);
    }

    // 2. Hub
    const hubRes = await client.query(
      `INSERT INTO ${S}.hubs (hub_id, hub_name, city) VALUES ($1,$2,$3) RETURNING id`,
      ["HUB-122", "Noida-122", "Noida"]
    );
    const hubId = hubRes.rows[0].id;
    console.log("Created hub Noida-122:", hubId);

    // 3. Vehicles — create unique EVs, assign to hub
    const vehicleMap = {};
    for (const ev of EV_NUMBERS) {
      const vRes = await client.query(
        `INSERT INTO ${S}.vehicles (ev_number, chassis_number, model_id, hub_id, status) VALUES ($1,$2,$3,$4,'assigned') RETURNING id`,
        [ev, ev, modelId, hubId]
      );
      vehicleMap[ev] = vRes.rows[0].id;
    }
    console.log(`Created ${EV_NUMBERS.length} vehicles`);

    // 4. Riders
    const riderMap = {};
    for (const r of RIDERS) {
      const rRes = await client.query(
        `INSERT INTO ${S}.riders (
          name, mobile, aadhaar, rental_mode, business_type, employer,
          swap_quota, swap_cycle, onboarding_fee, security_deposit,
          assigned_hub_id, status, created_at, created_by
        ) VALUES ($1,$2,$3,$4,'rental',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          r.name, r.mobile, "AADHAAR-" + r.mobile,
          r.rental_mode, r.employer,
          r.swap_quota, r.swap_cycle, r.onboarding_fee, r.security_deposit,
          hubId, r.status, r.joined + "T00:00:00+05:30", "priyam@movegrid.in",
        ]
      );
      riderMap[r.mobile] = rRes.rows[0].id;
    }
    console.log(`Created ${RIDERS.length} riders`);

    // 5. Vehicle assignments
    // For riders whose EV was later reassigned: mark as 'returned'
    // For current riders with those same EVs: mark as 'active'
    // Logic: a rider is 'returned' if their status is 'inactive' AND their ev is in RETURNED_EVS
    for (const r of RIDERS) {
      const vId = vehicleMap[r.ev];
      const riderId = riderMap[r.mobile];
      const isReturned = r.status === "inactive" && RETURNED_EVS.has(r.ev);
      const assignStatus = isReturned ? "returned" : "active";
      await client.query(
        `INSERT INTO ${S}.rider_vehicle_assignments (rider_id, vehicle_id, hub_id, status, assigned_date) VALUES ($1,$2,$3,$4,$5)`,
        [riderId, vId, hubId, assignStatus, r.joined]
      );
    }
    console.log(`Created ${RIDERS.length} vehicle assignments`);

    // 6. Rent payments
    let payCount = 0;
    for (const [mobile, dateStr, amount] of PAYMENTS) {
      const riderId = riderMap[mobile];
      if (!riderId) { console.warn(`  WARN: no rider for mobile ${mobile}`); continue; }
      const d = new Date(dateStr);
      const periodStart = new Date(d);
      periodStart.setDate(d.getDate() - 6);
      const ps = periodStart.toISOString().split("T")[0];
      await client.query(
        `INSERT INTO ${S}.rider_payments (rider_id, amount_collected, payment_date, rental_period_start, rental_period_end)
         VALUES ($1,$2,$3,$4,$5)`,
        [riderId, amount, dateStr, ps, dateStr]
      );
      payCount++;
    }
    console.log(`Created ${payCount} rent payments`);

    await client.query("COMMIT");
    console.log("\nImport complete!\n");

    // Verification
    const [total, active, inactive, vehicles, payments, hubs] = await Promise.all([
      client.query(`SELECT COUNT(*) FROM ${S}.riders`),
      client.query(`SELECT COUNT(*) FROM ${S}.riders WHERE status='active'`),
      client.query(`SELECT COUNT(*) FROM ${S}.riders WHERE status='inactive'`),
      client.query(`SELECT COUNT(*) FROM ${S}.vehicles`),
      client.query(`SELECT COUNT(*) FROM ${S}.rider_payments`),
      client.query(`SELECT COUNT(*) FROM ${S}.hubs`),
    ]);
    console.log("Verification:");
    console.log(`  Riders total : ${total.rows[0].count}`);
    console.log(`  Active       : ${active.rows[0].count}`);
    console.log(`  Inactive     : ${inactive.rows[0].count}`);
    console.log(`  Vehicles     : ${vehicles.rows[0].count}`);
    console.log(`  Payments     : ${payments.rows[0].count}`);
    console.log(`  Hubs         : ${hubs.rows[0].count}`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nROLLBACK due to error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
