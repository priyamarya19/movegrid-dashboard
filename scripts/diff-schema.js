// One-off: reconcile prod's base schema to UAT.
//
// The base schema (tables + original columns) was built ad-hoc on UAT and never
// captured as a migration, so prod (mg_data) can be missing base columns that the
// tracked migrations 001-009 assume already exist (e.g. riders.rider_code). This
// diffs UAT -> prod and reports/adds the missing columns.
//
//   node scripts/diff-schema.js           # DRY RUN: print the gap + the ALTER SQL, change nothing
//   node scripts/diff-schema.js --apply   # run the ADD COLUMN IF NOT EXISTS statements on prod
//
// Read-only by default. Both schemas live in the same database (movegrid), so one
// connection sees both. Compares mg_data_uat->mg_data and uat_auth->auth.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const APPLY = process.argv.includes("--apply");
const PAIRS = [
  { from: "mg_data_uat", to: "mg_data" },
  { from: "uat_auth", to: "auth" },
  { from: "uat_logs", to: "logs" },   // audit_logs lives here (schemas.logs), a separate schema
];

const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

// Exact column definitions (type, nullability, default) for one schema.
async function cols(schema) {
  const { rows } = await client.query(`
    SELECT c.relname AS tbl, a.attname AS col,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null,
           pg_get_expr(ad.adbin, ad.adrelid) AS dflt
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`, [schema]);
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.tbl)) byTable.set(r.tbl, new Map());
    byTable.get(r.tbl).set(r.col, r);
  }
  return byTable;
}

(async () => {
  await client.connect();
  console.log(`DB: ${env.RDS_DATABASE}   mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const schemasNeeded = new Set();
  const creates = [];
  const alters = [];
  const nullDrops = [];
  const warnings = [];

  for (const { from, to } of PAIRS) {
    const [src, dst] = [await cols(from), await cols(to)];
    console.log(`── ${from}  →  ${to} ──`);
    for (const [tbl, srcCols] of src) {
      const dstCols = dst.get(tbl);
      if (!dstCols) {
        // Clone the whole table structure from UAT (columns, PK, indexes, CHECK/
        // NOT NULL, defaults). LIKE does NOT copy FK constraints — fine here, the
        // data we copy from UAT is already consistent; add FKs later if wanted.
        schemasNeeded.add(to);
        creates.push(`CREATE TABLE IF NOT EXISTS ${to}.${tbl} (LIKE ${from}.${tbl} INCLUDING ALL);`);
        console.log(`  ⊕ CREATE TABLE ${tbl}  (clone from ${from})`);
        continue;
      }
      for (const [col, def] of srcCols) {
        const dstDef = dstCols.get(col);
        if (dstDef) {
          // Column exists in both. If prod is NOT NULL but UAT allows NULL, prod is
          // stricter and will reject UAT rows on copy — relax it to match UAT.
          if (dstDef.not_null && !def.not_null) {
            nullDrops.push(`ALTER TABLE ${to}.${tbl} ALTER COLUMN ${col} DROP NOT NULL;`);
            console.log(`  ~ ${tbl}.${col}  DROP NOT NULL (UAT nullable, prod NOT NULL)`);
          }
          continue;
        }
        // Build a safe ADD COLUMN: keep the default; only keep NOT NULL if a default
        // exists (so it can't fail on any existing rows).
        let sql = `ALTER TABLE ${to}.${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def.type}`;
        if (def.dflt) sql += ` DEFAULT ${def.dflt}`;
        if (def.not_null && def.dflt) sql += ` NOT NULL`;
        else if (def.not_null && !def.dflt) warnings.push(`${to}.${tbl}.${col} is NOT NULL in ${from} but has no default — added as NULLABLE; backfill + set NOT NULL manually if needed.`);
        sql += ";";
        alters.push(sql);
        console.log(`  + ${tbl}.${col}  ${def.type}`);
      }
    }
    console.log("");
  }

  // Tables must be created before column ALTERs run (though the two sets never
  // touch the same table). Creates first, then alters.
  const schemaCreates = [...schemasNeeded].map((s) => `CREATE SCHEMA IF NOT EXISTS ${s};`);
  const stmts = [...schemaCreates, ...creates, ...alters, ...nullDrops];
  if (!stmts.length) {
    console.log("✓ Nothing missing — prod base schema already matches UAT.");
  } else {
    console.log(`\n${creates.length} table(s) + ${alters.length} column(s) + ${nullDrops.length} nullability fix(es). SQL:\n`);
    console.log(stmts.join("\n"));
    if (APPLY) {
      console.log(`\nApplying...`);
      for (const sql of stmts) { process.stdout.write(`→ ${sql} `); await client.query(sql); console.log("ok"); }
      console.log(`\n✓ Applied ${creates.length} table(s) + ${alters.length} column(s) + ${nullDrops.length} nullability fix(es) to prod.`);
    } else {
      console.log(`\n(DRY RUN — nothing changed. Re-run with --apply to add these.)`);
    }
  }

  if (warnings.length) { console.log(`\n⚠ Warnings:`); warnings.forEach((w) => console.log(`  - ${w}`)); }
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
