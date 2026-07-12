// Migration runner — the single, ordered, tracked way to evolve the schema.
//
//   node scripts/migrate.js            # apply pending migrations to the .env.local target
//   RDS_ENV=uat node scripts/migrate.js  # → uat_auth + mg_data_uat
//   node scripts/migrate.js            # (RDS_ENV unset) → auth + mg_data (prod)
//   node scripts/migrate.js --status   # list applied vs pending, apply nothing
//
// Replaces the pile of hand-run scripts/add-*.js: each migration in migrations/
// runs exactly once per database and is recorded in <ops>.schema_migrations, so
// the UAT-vs-prod drift that caused the investor-page 500s can't happen again.
// Migrations must still be idempotent (IF NOT EXISTS etc.) as a belt-and-braces.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";   // ops schema
const A = isUAT ? "uat_auth" : "auth";          // auth schema
const STATUS_ONLY = process.argv.includes("--status");

const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  console.log(`Target: ${env.RDS_DATABASE}  (ops=${S}, auth=${A})\n`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const done = new Set((await client.query(`SELECT id FROM ${S}.schema_migrations`)).rows.map((r) => r.id));
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();

  if (STATUS_ONLY) {
    for (const f of files) console.log(`  ${done.has(f) ? "✓ applied" : "· pending"}  ${f}`);
    await client.end();
    return;
  }

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const migration = require(path.join(dir, f));
    process.stdout.write(`→ ${f} ... `);
    await client.query("BEGIN");
    try {
      await migration.up({ client, S, A });
      await client.query(`INSERT INTO ${S}.schema_migrations (id) VALUES ($1)`, [f]);
      await client.query("COMMIT");
      console.log("done");
      applied++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      console.error(`\n❌ ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(applied ? `\n✅ Applied ${applied} migration(s).` : "\n✅ Up to date — nothing to apply.");
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
