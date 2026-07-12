// Hardware-fault vehicle swap: mark a return as an issue-swap and the days the
// vehicle was non-functional (credited via a waiver).
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS is_issue_swap boolean NOT NULL DEFAULT false`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS non_functional_days integer NOT NULL DEFAULT 0`);
};
