// Imports rider KYC from a tab-separated export of the onboarding sheet.
//
// Usage:  node scripts/import-kyc.js scripts/kyc.tsv
//
// Expects the sheet exported as TSV (Google Sheets: File > Download > .tsv)
// with the original header row intact. Columns (in order):
//   Timestamp | Rider name | Rider mobile number | Rider Current Address |
//   Current address Map link | Aadhar card (Front and back) | PAN card |
//   Bank account passbook/Cancelled cheque | Bank Name | Bank account number |
//   Bank IFSC code | Family Reference Name | Family reference aadhar card (Front and back) |
//   Family reference Mobile number | Driving license | FIlled by |
//   Local reference name | Local reference mob no
//
// Behaviour (per agreed decisions):
//   - Match riders by mobile (digits only).
//   - Existing rider  -> UPDATE the KYC fields below.
//   - Unknown mobile  -> INSERT a new rider (status 'pending', no EV assignment).
//   - Values stored literally as-is (including 000000 / scientific-notation banks).
//   - Aadhaar/DL cells with two comma-separated URLs split into front/back.

const { Client } = require("pg");
const fs = require("fs");

const FILE = process.argv[2];
if (!FILE) { console.error("Usage: node scripts/import-kyc.js <path-to.tsv>"); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error(`File not found: ${FILE}`); process.exit(1); }

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

const clean = (s) => (s == null ? "" : String(s).trim());
const digits = (s) => clean(s).replace(/\D/g, "");
const nz = (s) => { const v = clean(s); return v === "" ? null : v; }; // empty -> null, else literal
const splitUrls = (s) => {
  const parts = clean(s).split(",").map((x) => x.trim()).filter(Boolean);
  return [parts[0] ?? null, parts[1] ?? null];
};

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows = lines.slice(1); // drop header
  return rows.map((line) => {
    const c = line.split("\t");
    const [aadhaarFront, aadhaarBack] = splitUrls(c[5]);
    const [dlFront, dlBack] = splitUrls(c[14]);
    return {
      name: nz(c[1]),
      mobile: digits(c[2]),
      current_address: nz(c[3]),
      address_map_link: nz(c[4]),
      aadhaar_front_url: aadhaarFront,
      aadhaar_back_url: aadhaarBack,
      pan_image_url: nz(c[6]),
      bank_doc_url: nz(c[7]),
      bank: nz(c[8]),
      account_number: nz(c[9]),
      ifsc: nz(c[10]),
      family_ref_name: nz(c[11]),
      family_ref_aadhaar_url: nz(c[12]),
      family_ref_mobile: digits(c[13]),
      dl_front_url: dlFront,
      dl_back_url: dlBack,
      created_by: nz(c[15]),
      local_ref_name: nz(c[16]),
      local_ref_mobile: digits(c[17]),
    };
  }).filter((r) => r.mobile);
}

async function nextRiderCode() {
  const r = await client.query(
    `SELECT rider_code FROM ${S}.riders WHERE rider_code ~ '^MG[0-9]+$'
     ORDER BY (regexp_replace(rider_code,'\\D','','g'))::int DESC LIMIT 1`
  );
  const last = r.rows[0]?.rider_code ?? "MG000000";
  const n = parseInt(last.replace(/\D/g, ""), 10) + 1;
  return "MG" + String(n).padStart(6, "0");
}

const KYC_COLS = [
  "current_address", "address_map_link", "aadhaar_front_url", "aadhaar_back_url",
  "pan_image_url", "bank_doc_url", "bank", "account_number", "ifsc",
  "family_ref_name", "family_ref_aadhaar_url", "family_ref_mobile",
  "dl_front_url", "dl_back_url", "local_ref_name", "local_ref_mobile",
];

async function run() {
  const rows = parseTsv(fs.readFileSync(FILE, "utf8"));
  console.log(`Parsed ${rows.length} rider rows from ${FILE}\n`);

  await client.connect();
  console.log(`Connected to ${env.RDS_DATABASE} (schema ${S})\n`);
  await client.query("BEGIN");
  try {
    const hub = await client.query(`SELECT id FROM ${S}.hubs WHERE hub_name = 'Noida-122' LIMIT 1`);
    const hubId = hub.rows[0]?.id ?? null;

    let updated = 0, inserted = 0;
    const dupWarn = [];

    for (const r of rows) {
      const found = await client.query(`SELECT id, name FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g') = $1 LIMIT 1`, [r.mobile]);

      if (found.rows[0]) {
        const set = KYC_COLS.map((col, i) => `${col} = $${i + 1}`).join(", ");
        const vals = KYC_COLS.map((col) => r[col]);
        vals.push(found.rows[0].id);
        await client.query(`UPDATE ${S}.riders SET ${set} WHERE id = $${KYC_COLS.length + 1}`, vals);
        updated++;
      } else {
        // Warn if someone with the same name already exists under a different mobile.
        const nameHit = await client.query(`SELECT mobile FROM ${S}.riders WHERE lower(name) = lower($1) LIMIT 1`, [r.name ?? ""]);
        if (nameHit.rows[0]) dupWarn.push(`${r.name}: new mobile ${r.mobile}, existing rider has ${nameHit.rows[0].mobile}`);

        const code = await nextRiderCode();
        const cols = ["rider_code", "name", "mobile", "aadhaar", "rental_mode", "status",
          "assigned_hub_id", "created_by", "created_at", ...KYC_COLS];
        const vals = [code, r.name, r.mobile, "AADHAAR-" + r.mobile, "weekly", "pending",
          hubId, r.created_by, new Date().toISOString(), ...KYC_COLS.map((c) => r[c])];
        const ph = vals.map((_, i) => `$${i + 1}`).join(",");
        await client.query(`INSERT INTO ${S}.riders (${cols.join(",")}) VALUES (${ph})`, vals);
        inserted++;
        console.log(`  + inserted ${code} ${r.name} (${r.mobile})`);
      }
    }

    if (dupWarn.length) {
      console.log("\n⚠ Possible duplicate riders (same name, different mobile) — inserted as NEW per your instruction:");
      dupWarn.forEach((w) => console.log("  " + w));
    }

    await client.query("COMMIT");
    console.log(`\n✅ Done. Updated: ${updated}, Inserted: ${inserted}, Total: ${rows.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
