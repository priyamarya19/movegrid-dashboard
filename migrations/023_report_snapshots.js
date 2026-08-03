// Daily collection snapshot written by the evening report job — makes the
// week-over-week numbers exact instead of reconstructed.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.report_snapshots (
      snapshot_date date PRIMARY KEY,
      riders_owing int NOT NULL,
      outstanding_total numeric NOT NULL,
      collected_7d numeric NOT NULL,
      expected_7d numeric NOT NULL,
      bad_debt_total numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
};
