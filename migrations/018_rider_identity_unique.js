// One identity, one rider: mobile, Aadhaar, PAN and bank account can each
// belong to only ONE rider. Enforced at the database so no entry path (rider
// app KYC, dashboard forms, imports) can create a duplicate. Prod data verified
// duplicate-free before this ships. Partial indexes: NULL/empty values stay
// unconstrained (e.g. low-speed riders without PAN).
module.exports.up = async ({ client, S }) => {
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS riders_mobile_unique
    ON ${S}.riders ((RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10)))`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS riders_aadhaar_unique
    ON ${S}.riders (aadhaar) WHERE aadhaar IS NOT NULL AND aadhaar <> ''`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS riders_pan_unique
    ON ${S}.riders (UPPER(pan)) WHERE pan IS NOT NULL AND pan <> ''`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS riders_account_unique
    ON ${S}.riders (account_number) WHERE account_number IS NOT NULL AND account_number <> ''`);
};
