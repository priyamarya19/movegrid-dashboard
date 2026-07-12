// Permanent link so the rent ledger keeps week numbers + cadence continuous
// across an issue-swap vehicle change (unlike is_issue_swap, which is consumed).
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS continues_from_assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id)`);
};
