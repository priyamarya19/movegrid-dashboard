// Free-form "Additional Photos" galleries for the onboarding forms, which otherwise
// only have fixed single-slot document fields. Allotment (allotment_pics) and return
// (return_photos) already store arrays, so they need no column.
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.vehicles ADD COLUMN IF NOT EXISTS vehicle_photos text[]`);
  await client.query(`ALTER TABLE ${S}.riders ADD COLUMN IF NOT EXISTS additional_photos text[]`);
};
