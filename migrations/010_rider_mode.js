// Rider mode = the business/relationship type (B2B fleet rental / Rider rental /
// B2B rider). Previously the allotment form wrote these into rental_mode, which is
// the weekly/monthly billing PLAN and is guarded by riders_rental_mode_check — so
// every allotment 500'd. rider_mode gets its own column; rental_mode stays the plan.
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.riders ADD COLUMN IF NOT EXISTS rider_mode text`);
  await client.query(`ALTER TABLE ${S}.riders DROP CONSTRAINT IF EXISTS riders_rider_mode_check`);
  await client.query(`
    ALTER TABLE ${S}.riders ADD CONSTRAINT riders_rider_mode_check
    CHECK (rider_mode IS NULL OR rider_mode = ANY (ARRAY['B2B fleet rental'::text, 'Rider rental'::text, 'B2B rider'::text]))`);
};
