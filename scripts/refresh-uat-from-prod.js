// Refresh mg_data_uat from a live mg_data snapshot, so UAT (and the rider test
// app's rider picker) mirrors real fleet data. Dry-run by default; --apply runs
// the copy in ONE transaction.
//
//   node scripts/refresh-uat-from-prod.js           # show what would be copied
//   node scripts/refresh-uat-from-prod.js --apply   # truncate UAT + copy prod
//
// - Copies every table present in BOTH schemas except schema_migrations (each
//   environment tracks its own migration history).
// - Insert order is FK-topo-sorted from UAT's constraints — UAT enforces FKs
//   that prod historically lacks (e.g. rider_penalties has none in prod).
// - Per-table column intersection guards against column-order drift.
// - Sequences (allotment_code_seq, rider_code_seq, …) are set to prod's values.
// - UAT auth (uat_auth.users) is untouched: dashboard/app test logins survive.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), quiet: true });
const { Client } = require("pg");

const SRC = "mg_data";
const DST = "mg_data_uat";
const SKIP = new Set(["schema_migrations"]);
const APPLY = process.argv.includes("--apply");

(async () => {
  const c = new Client({
    host: process.env.RDS_HOST, port: +process.env.RDS_PORT, user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD, database: process.env.RDS_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Refresh ${DST} <- ${SRC} snapshot   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to run)"}\n`);

  const tablesIn = async (schema) =>
    (await c.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE'`, [schema]
    )).rows.map((r) => r.table_name);
  const srcTables = new Set(await tablesIn(SRC));
  const tables = (await tablesIn(DST)).filter((t) => srcTables.has(t) && !SKIP.has(t));

  // FK graph from the DESTINATION schema — UAT's constraints do the enforcing.
  // Cross-schema parents (uat_auth.users) are excluded from ordering.
  const fks = (await c.query(`
    SELECT ch.relname AS child, pa.relname AS parent
    FROM pg_constraint con
    JOIN pg_class ch ON ch.oid = con.conrelid
    JOIN pg_class pa ON pa.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = ch.relnamespace
    JOIN pg_namespace np ON np.oid = pa.relnamespace
    WHERE con.contype = 'f' AND n.nspname = $1 AND np.nspname = $1`, [DST])).rows
    .filter((e) => e.child !== e.parent);
  const order = [];
  const pending = new Set(tables);
  while (pending.size) {
    let progressed = false;
    for (const t of [...pending]) {
      if (!fks.some((e) => e.child === t && pending.has(e.parent))) {
        order.push(t); pending.delete(t); progressed = true;
      }
    }
    if (!progressed) { order.push(...pending); pending.clear(); } // FK cycles: append rest
  }

  const cols = async (schema, table) =>
    (await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
      [schema, table]
    )).rows.map((r) => r.column_name);

  if (!APPLY) {
    for (const t of order) {
      const src = await c.query(`SELECT COUNT(*) AS n FROM ${SRC}."${t}"`);
      const dst = await c.query(`SELECT COUNT(*) AS n FROM ${DST}."${t}"`);
      console.log(`  ${t}: uat ${dst.rows[0].n} rows -> would become ${src.rows[0].n}`);
    }
    console.log("\nDry run only — nothing changed.");
    await c.end();
    return;
  }

  try {
    await c.query("BEGIN");
    await c.query(`TRUNCATE ${tables.map((t) => `${DST}."${t}"`).join(", ")} CASCADE`);

    const report = [];
    for (const t of order) {
      const srcCols = await cols(SRC, t);
      const dstCols = new Set(await cols(DST, t));
      const use = srcCols.filter((x) => dstCols.has(x));
      const colList = use.map((x) => `"${x}"`).join(", ");
      const r = await c.query(`INSERT INTO ${DST}."${t}" (${colList}) SELECT ${colList} FROM ${SRC}."${t}"`);
      report.push({ table: t, rows: r.rowCount });
    }

    const seqs = (await c.query(`SELECT sequencename FROM pg_sequences WHERE schemaname=$1`, [SRC])).rows;
    for (const { sequencename } of seqs) {
      const exists = await c.query(`SELECT 1 FROM pg_sequences WHERE schemaname=$1 AND sequencename=$2`, [DST, sequencename]);
      if (!exists.rows[0]) continue;
      const v = await c.query(`SELECT last_value, is_called FROM ${SRC}."${sequencename}"`);
      await c.query(`SELECT setval('${DST}."${sequencename}"', $1, $2)`, [v.rows[0].last_value, v.rows[0].is_called]);
    }

    await c.query("COMMIT");
    console.table(report);
    console.log("Sequences synced:", seqs.map((s) => s.sequencename).join(", ") || "none");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
