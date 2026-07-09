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

// Source: hardware onboarding sheet. Matched to vehicles by chassis_number.
// model: Shelby BS (0010-0029) | EV Juno MB / Mooving (0030-0040) | EV Juno BS / Battery Smart (0041-0050)
// Values taken literally from the sheet (no normalisation).
const ROWS = [
  { ev: "MG0426N0010", chassis: "SLY22Z101SC043018", model: "Shelby BS",  motor: "WLYSS2311M 250W202510170060930", controller: "MACEWLY20251048607232A03175", imei: "8662210706688002",  iot: "Fixx ev/Loconav", battery: "B657261", bpartner: "Battery Smart" },
  { ev: "MG0426N0020", chassis: "SLY22Z101SC042209", model: "Shelby BS",  motor: "250W202510170061070",          controller: "MACEWLY20251048607232A02582", imei: "866221070793976",   iot: "Fixx ev/Loconav", battery: "B969866", bpartner: "Battery Smart" },
  { ev: "MG0426N0024", chassis: "SLY22Z101SC042219", model: "Shelby BS",  motor: "250W202510170060922",          controller: "MACEWLY20251048607232A03164", imei: "8662210706880036",  iot: "Fixx ev/Loconav", battery: "B978616", bpartner: "Battery Smart" },
  { ev: "MG0426N0023", chassis: "SLY22Z101SC042229", model: "Shelby BS",  motor: "250W202510170061080",          controller: "MACEWLY20251048607232A03181", imei: "866221070794586",   iot: "Fixx ev/Loconav", battery: "B769104", bpartner: "Battery Smart" },
  { ev: "MG0426N0029", chassis: "SLY22Z101SC041779", model: "Shelby BS",  motor: "250W202510170061084",          controller: "MACEWLY20251048607232A03168", imei: "866221070793455",   iot: "Fixx ev/Loconav", battery: "B768269", bpartner: "Battery Smart" },
  { ev: "MG0426N0014", chassis: "SLY22Z101SC937622", model: "Shelby BS",  motor: "250W202510170061079",          controller: "MACEWLY20251048607232A03180", imei: "866221070688002",   iot: "Fixx ev/Loconav", battery: "B920199", bpartner: "Battery Smart" },
  { ev: "MG0426N0028", chassis: "SLY22Z101SC041443", model: "Shelby BS",  motor: "250W2025101700600937",         controller: "MACEWLY20251048607232A03155", imei: "866221070688143",   iot: "Fixx ev/Loconav", battery: "B657261", bpartner: "Battery Smart" },
  { ev: "MG0426N0027", chassis: "SLY22Z101SC042224", model: "Shelby BS",  motor: "250W202510170060939",          controller: "MACEWLY20251048607232A03162", imei: "866221070793968",   iot: "Fixx ev/Loconav", battery: "B957231", bpartner: "Battery Smart" },
  { ev: "MG0426N0026", chassis: "SLY22Z101SC041441", model: "Shelby BS",  motor: "250W202510170060972",          controller: "MACEWLY20251048607232A03166", imei: "866221070689711",   iot: "Fixx ev/Loconav", battery: "B524545", bpartner: "Battery Smart" },
  { ev: "MG0426N0025", chassis: "SLY22Z101SC041444", model: "Shelby BS",  motor: "250W202510170060933",          controller: "MACEWLY20251048607232A03167", imei: "866221070795096",   iot: "Fixx ev/Loconav", battery: "B525200", bpartner: "Battery Smart" },
  { ev: "MG0426N0011", chassis: "SLY22Z101SC041445", model: "Shelby BS",  motor: "250W202510170060935",          controller: "MACEWLY20251048607232A03149", imei: "866221070688218",   iot: "Fixx ev/Loconav", battery: "B399010", bpartner: "Battery Smart" },
  { ev: "MG0426N0012", chassis: "SLY22Z101SC041424", model: "Shelby BS",  motor: "250W202510170060916",          controller: "MACEWLY20251048607232A03161", imei: "866221070687988",   iot: "Fixx ev/Loconav", battery: "B525200", bpartner: "Battery Smart" },
  { ev: "MG0426N0013", chassis: "SLY22Z101SC041419", model: "Shelby BS",  motor: "250W202510170060954",          controller: "MACEWLY20251048607232A03150", imei: "866221070687913",   iot: "Fixx ev/Loconav", battery: "B957231", bpartner: "Battery Smart" },
  { ev: "MG0426N0015", chassis: "SLY22Z101SC937657", model: "Shelby BS",  motor: "250W202510170060920",          controller: "MACEWLY20251048607232A03157", imei: "866221070689752",   iot: "Fixx ev/Loconav", battery: "B840242", bpartner: "Battery Smart" },
  { ev: "MG0426N0016", chassis: "SLY22Z101SC041434", model: "Shelby BS",  motor: "250W202510170060931",          controller: "MACEWLY20251048607232A03171", imei: "866221070687822",   iot: "Fixx ev/Loconav", battery: "B524545", bpartner: "Battery Smart" },
  { ev: "MG0426N0017", chassis: "SLY22Z101SC042222", model: "Shelby BS",  motor: "250W202510170061074",          controller: "MACEWLY20251048607232A03177", imei: "866221070793521",   iot: "Fixx ev/Loconav", battery: "B969866", bpartner: "Battery Smart" },
  { ev: "MG0426N0018", chassis: "SLY22Z101SC041439", model: "Shelby BS",  motor: "250W202510170061085",          controller: "MACEWLY20251048607232A03169", imei: "866221070687772",   iot: "Fixx ev/Loconav", battery: "B978616", bpartner: "Battery Smart" },
  { ev: "MG0426N0019", chassis: "SLY22Z101SC041423", model: "Shelby BS",  motor: "250W202510170060959",          controller: "MACEWLY20251048607232A03170", imei: "866221070687962",   iot: "Fixx ev/Loconav", battery: "B657261", bpartner: "Battery Smart" },
  { ev: "MG0426N0021", chassis: "SLY22Z101SC937659", model: "Shelby BS",  motor: "250W202510170060962",          controller: "MACEWLY20251048607232A03163", imei: "866221070689851",   iot: "Fixx ev/Loconav", battery: "B719271", bpartner: "Battery Smart" },
  { ev: "MG0426N0022", chassis: "SLY22Z101SC042212", model: "Shelby BS",  motor: "250W202510170060927",          controller: "MACEWLY20251048607232A03165", imei: "866221070794255",   iot: "Fixx ev/Loconav", battery: "B888582", bpartner: "Battery Smart" },

  { ev: "MG0426N0030", chassis: "SLY22Z102SC066603", model: "EV Juno MB", motor: "250W202510190066764",          controller: "MACEVWLY20251148607232A07160", imei: "866221070689737",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0360", bpartner: "Mooving" },
  { ev: "MG0426N0031", chassis: "SLY22Z102SC066705", model: "EV Juno MB", motor: "250W202510190066748",          controller: "MACEVWLY20251148607232A08146", imei: "866221070794032",  iot: "Fixx ev/Loconav", battery: "INCBZC5145M0097", bpartner: "Mooving" },
  { ev: "MG0426N0032", chassis: "SLY22Z102SC066702", model: "EV Juno MB", motor: "250W202510190066620",          controller: "MACEVWLY20251148607232A07159", imei: "866221070688135",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0353", bpartner: "Mooving" },
  { ev: "MG0426N0033", chassis: "SLY22Z102SC066891", model: "EV Juno MB", motor: "250W202510190066775",          controller: "MACEVWLY20251148607232A07167", imei: "866221070687798",  iot: "Fixx ev/Loconav", battery: "INCBZB5145M0302", bpartner: "Mooving" },
  { ev: "MG0426N0034", chassis: "SLY22Z102SC066880", model: "EV Juno MB", motor: "250W202510190066772",          controller: "MACEVWLY20251148607232A08150", imei: "866221070689893",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0317", bpartner: "Mooving" },
  { ev: "MG0426N0035", chassis: "SLY22Z102SC066882", model: "EV Juno MB", motor: "250W202510190066762",          controller: "MACEVWLY20251148607232A08152", imei: "866221070721894",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0379", bpartner: "Mooving" },
  { ev: "MG0426N0036", chassis: "SLY22Z102SC066886", model: "EV Juno MB", motor: "250W202510190066294",          controller: "MACEVWLY20251148607232A08158", imei: "866221070722074",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0381", bpartner: "Mooving" },
  { ev: "MG0426N0037", chassis: "SLY22Z102SC066722", model: "EV Juno MB", motor: "250W202510190066741",          controller: "MACEVWLY20251148607232A08153", imei: "866221070722306",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0340", bpartner: "Mooving" },
  { ev: "MG0426N0038", chassis: "SLY22Z102SC066905", model: "EV Juno MB", motor: "250W202510190066766",          controller: "MACEVWLY20251148607232A08148", imei: "866221070719971",  iot: "Fixx ev/Loconav", battery: "INCBZB5145M0350", bpartner: "Mooving" },
  { ev: "MG0426N0039", chassis: "SLY22Z102SC066901", model: "EV Juno MB", motor: "250W202510190066624",          controller: "MACEVWLY20251148607232A07839", imei: "866221070713008",  iot: "Fixx ev/Loconav", battery: "INCBZD5145M0388", bpartner: "Mooving" },
  { ev: "MG0426N0040", chassis: "NEOAF202500118",    model: "EV Juno MB", motor: "NEOAQM202500048",              controller: "NEOAC202500134",                imei: "866221070721225",  iot: "Fixx ev/Loconav", battery: "INCBZB5145M0795", bpartner: "Mooving" },

  { ev: "MG0426N0041", chassis: "SLY22Z101TA900886", model: "EV Juno BS", motor: "EVJuno250w2604SLY120",         controller: "MACEVWLY20251148607232A08054", imei: "866221070721175",  iot: "Fixx ev/Loconav", battery: "B1010727", bpartner: "Battery Smart" },
  { ev: "MG0426N0042", chassis: "SLY22Z101TA900822", model: "EV Juno BS", motor: "EVJuno250w2604SLY130",         controller: "MACEVWLY20251148607232A08070", imei: "866221070715797",  iot: "Fixx ev/Loconav", battery: "B732954",  bpartner: "Battery Smart" },
  { ev: "MG0429N0043", chassis: "SLY22Z101TA900212", model: "EV Juno BS", motor: "EVJuno250w2604SLY106",         controller: "MACEVWLY20251148607232A08051", imei: "866221070715813",  iot: "Fixx ev/Loconav", battery: "B260032",  bpartner: "Battery Smart" },
  { ev: "MG0426N0044", chassis: "SLY22Z101TA900823", model: "EV Juno BS", motor: "EVJuno250w2604SLY102",         controller: "MACEVWLY20251148607232A08046", imei: "866221070715706",  iot: "Fixx ev/Loconav", battery: "B447552",  bpartner: "Battery Smart" },
  { ev: "MG0426N0045", chassis: "SLY22Z101TA900839", model: "EV Juno BS", motor: "EVJuno250w2604SLY090",         controller: "MACEVWLY20251148607232A08055", imei: "866201070721936",  iot: "Fixx ev/Loconav", battery: "B937126",  bpartner: "Battery Smart" },
  { ev: "MG0426N0046", chassis: "SLY22Z101TA900281", model: "EV Juno BS", motor: "EVJuno250w2604SLY094",         controller: "MACEVWLY20251148607232A08069", imei: "866221070715714",  iot: "Fixx ev/Loconav", battery: "B754640",  bpartner: "Battery Smart" },
  { ev: "MG0426N0047", chassis: "SLY22Z101TA900219", model: "EV Juno BS", motor: "EVJuno250w2604SLY096",         controller: "MACEVWLY20251148607232A08066", imei: "866221070722546",  iot: "Fixx ev/Loconav", battery: "B433832",  bpartner: "Battery Smart" },
  { ev: "MG0426N0048", chassis: "SLY22Z101TA900905", model: "EV Juno BS", motor: "EVJuno250w2604SLY119",         controller: "MACEVWLY20251148607232A08081", imei: "866221070719757",  iot: "Fixx ev/Loconav", battery: "B897063",  bpartner: "Battery Smart" },
  { ev: "MG0426N0049", chassis: "SLY22Z102SC066669", model: "EV Juno BS", motor: "EVJuno250w2604SLY111",         controller: "MACEVWLY20251148607232A08052", imei: "866221070722314",  iot: "Fixx ev/Loconav", battery: "B896548",  bpartner: "Battery Smart" },
  { ev: "MG0426N0050", chassis: "SLY22Z101TA900868", model: "EV Juno BS", motor: "EVJuno250w2604SLY095",         controller: "MACEVWLY20251148607232A08047", imei: "866221070717157",  iot: "Fixx ev/Loconav", battery: "B840311",  bpartner: "Battery Smart" },
];

async function modelId(name) {
  if (name === "Shelby BS") {
    const r = await client.query(`SELECT id FROM ${S}.vehicle_models WHERE model_name ILIKE 'shelby%' LIMIT 1`);
    return r.rows[0]?.id ?? null;
  }
  const r = await client.query(`SELECT id FROM ${S}.vehicle_models WHERE model_name = $1 LIMIT 1`, [name]);
  return r.rows[0]?.id ?? null;
}

async function run() {
  await client.connect();
  console.log(`Connected to ${env.RDS_DATABASE} (schema ${S})\n`);
  await client.query("BEGIN");
  try {
    const hubRes = await client.query(`SELECT id FROM ${S}.hubs WHERE hub_name = 'Noida-122' LIMIT 1`);
    const hubId = hubRes.rows[0]?.id ?? null;

    const modelCache = {};
    let updated = 0, inserted = 0;
    const evChanges = [];

    for (const v of ROWS) {
      if (!(v.model in modelCache)) modelCache[v.model] = await modelId(v.model);
      const mId = modelCache[v.model];
      if (!mId) throw new Error(`No model_id for "${v.model}" (vehicle ${v.ev})`);

      const found = await client.query(`SELECT id, ev_number FROM ${S}.vehicles WHERE chassis_number = $1`, [v.chassis]);

      if (found.rows[0]) {
        const row = found.rows[0];
        if (row.ev_number !== v.ev) evChanges.push(`${row.ev_number} -> ${v.ev} (chassis ${v.chassis})`);
        await client.query(`
          UPDATE ${S}.vehicles SET
            ev_number = $1, motor_number = $2, controller_number = $3,
            iot_imei = $4, iot_partner = $5, battery_number = $6, battery_partner = $7,
            model_id = $8
          WHERE id = $9`,
          [v.ev, v.motor, v.controller, v.imei, v.iot, v.battery, v.bpartner, mId, row.id]
        );
        updated++;
      } else {
        await client.query(`
          INSERT INTO ${S}.vehicles (
            ev_number, chassis_number, motor_number, controller_number,
            iot_imei, iot_partner, battery_number, battery_partner,
            model_id, hub_id, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'available')`,
          [v.ev, v.chassis, v.motor, v.controller, v.imei, v.iot, v.battery, v.bpartner, mId, hubId]
        );
        inserted++;
        console.log(`  + inserted ${v.ev} (${v.chassis}) — not previously in table`);
      }
    }

    if (evChanges.length) {
      console.log("\nEV-number changes (matched by chassis):");
      evChanges.forEach(c => console.log("  " + c));
    }

    await client.query("COMMIT");
    console.log(`\n✅ Done. Updated: ${updated}, Inserted: ${inserted}, Total rows: ${ROWS.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
