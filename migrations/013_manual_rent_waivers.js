// Manual rent-waiver applications: waivers can now be raised by staff for any
// reason (not only issue-swap credits), can be fractional (1.5 days), and carry
// a reason. The sub-day remainder of an approved fractional waiver lives as an
// ₹ credit on the assignment (rent_credit) and is folded into the next payment.
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.rent_waiver_requests ALTER COLUMN non_functional_days TYPE numeric(6,2)`);
  await client.query(`ALTER TABLE ${S}.rent_waiver_requests ADD COLUMN IF NOT EXISTS reason text`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS rent_credit numeric NOT NULL DEFAULT 0`);
};
