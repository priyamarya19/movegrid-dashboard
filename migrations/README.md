# Migrations

Ordered, tracked schema changes. The runner (`scripts/migrate.js`) applies each
file once per database and records it in `<ops_schema>.schema_migrations`, so UAT
and prod can never silently drift apart again.

## Usage

```bash
RDS_ENV=uat node scripts/migrate.js --status   # list applied vs pending
RDS_ENV=uat node scripts/migrate.js            # apply pending → uat_auth + mg_data_uat
node scripts/migrate.js                        # apply pending → auth + mg_data (PROD)
```

Run this as part of every deploy, before `npm run build`.

## Writing a migration

Add `NNN_description.js` (next number). Export an async `up`:

```js
module.exports.up = async ({ client, S, A }) => {
  // S = ops schema (mg_data / mg_data_uat), A = auth schema (auth / uat_auth)
  await client.query(`ALTER TABLE ${S}.some_table ADD COLUMN IF NOT EXISTS foo text`);
};
```

- Keep DDL **idempotent** (`IF NOT EXISTS`, `DROP … IF EXISTS` before `ADD`) as a
  belt-and-braces even though the runner won't re-run a recorded migration.
- The runner wraps each migration in a transaction and rolls back on error.
- Never edit or renumber a migration that has already been applied anywhere —
  add a new one instead.

## Note on the old `scripts/add-*.js`

Those are the pre-framework, hand-run scripts. Their schema changes are now
captured as migrations 001–009. Leave them for history; use the runner going
forward.
