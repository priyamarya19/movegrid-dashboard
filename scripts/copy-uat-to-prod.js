// One-off: copy UAT operational data into an EMPTY prod (going live).
//
//   node scripts/copy-uat-to-prod.js           # DRY RUN: per-table row counts, no writes
//   node scripts/copy-uat-to-prod.js --apply    # copy mg_data_uat -> mg_data in one transaction
//
// Both schemas live in the same database, so this is a straight schema-to-schema
// copy. Safety:
//   - Explicit shared-column lists (prod's column order differs after the ALTERs,
//     so SELECT * would misalign).
//   - FK triggers suspended for the load (session_replication_role=replica) so
//     table order / self-references can't fail; re-enabled before commit.
//   - ON CONFLICT DO NOTHING → re-runnable, and never clobbers rows prod already
//     has (e.g. the admin you're logged in with is in auth, not touched here).
//   - One transaction: any error rolls the whole thing back.
//   - Sequences (rider_code_seq, allotment_code_seq, …) resynced to UAT so newly
//     issued codes don't collide.
//
// NOT copied: schema_migrations (prod tracks its own), idempotency_keys + audit_logs
// (transient/history — prod starts clean), and auth.users (logins — handled
// separately so we don't move password hashes without you asking).
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const APPLY = process.argv.includes("--apply");
const FROM = "mg_data_uat", TO = "mg_data";
const SKIP = new Set(["schema_migrations", "idempotency_keys", "audit_logs"]);

const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

const q = (s, p) => client.query(s, p);

(async () => {
  await client.connect();
  console.log(`${FROM}  →  ${TO}   mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  // Base tables present in BOTH schemas.
  const tbls = (await q(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema=$1 AND table_type='BASE TABLE'
      AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema=$2 AND table_type='BASE TABLE')
    ORDER BY table_name`, [FROM, TO])).rows.map((r) => r.table_name).filter((t) => !SKIP.has(t));

  // Shared columns per table (intersection), preserving UAT ordinal order.
  async function sharedCols(t) {
    const { rows } = await q(`
      SELECT a.column_name FROM information_schema.columns a
      JOIN information_schema.columns b ON b.table_schema=$2 AND b.table_name=$3 AND b.column_name=a.column_name
      WHERE a.table_schema=$1 AND a.table_name=$3
      ORDER BY a.ordinal_position`, [FROM, TO, t]);
    return rows.map((r) => `"${r.column_name}"`);
  }

  console.log("Table                              UAT rows   prod rows");
  const plan = [];
  for (const t of tbls) {
    const uat = +(await q(`SELECT count(*) FROM ${FROM}.${t}`)).rows[0].count;
    const prod = +(await q(`SELECT count(*) FROM ${TO}.${t}`)).rows[0].count;
    plan.push({ t, uat, prod });
    console.log(`${t.padEnd(34)} ${String(uat).padStart(8)} ${String(prod).padStart(11)}`);
  }

  if (!APPLY) {
    console.log(`\n(DRY RUN — nothing copied. Re-run with --apply.)`);
    console.log(`Note: any table showing prod rows > 0 already has data; ON CONFLICT will skip duplicates.`);
    await client.end();
    return;
  }

  console.log(`\nCopying in one transaction (FK triggers suspended for the load)...`);
  await q("BEGIN");
  try {
    await q("SET session_replication_role = replica");
    let total = 0;
    for (const { t } of plan) {
      const cols = await sharedCols(t);
      const list = cols.join(", ");
      const res = await q(`INSERT INTO ${TO}.${t} (${list}) SELECT ${list} FROM ${FROM}.${t} ON CONFLICT DO NOTHING`);
      total += res.rowCount;
      console.log(`  ${t.padEnd(34)} +${res.rowCount}`);
    }
    await q("SET session_replication_role = DEFAULT");

    // Resync sequences to UAT's current value.
    const seqs = (await q(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema=$1`, [FROM])).rows.map((r) => r.sequence_name);
    for (const s of seqs) {
      const exists = (await q(`SELECT 1 FROM information_schema.sequences WHERE sequence_schema=$1 AND sequence_name=$2`, [TO, s])).rowCount;
      if (!exists) continue;
      const lv = (await q(`SELECT last_value FROM ${FROM}."${s}"`)).rows[0].last_value;
      await q(`SELECT setval('${TO}."${s}"', $1, true)`, [lv]);
      console.log(`  seq ${s} → ${lv}`);
    }

    await q("COMMIT");
    console.log(`\n✓ Copied ${total} rows. Prod now mirrors UAT operational data.`);
  } catch (e) {
    await q("ROLLBACK");
    console.error(`\n✗ Rolled back — nothing changed. Error: ${e.message}`);
    process.exit(1);
  }
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
