// A lead is not a rider.
//
// Migration 024 made every rider-type lead auto-create a rider record, on the
// reasoning that "rider leads ARE not-yet-onboarded riders". In practice that
// filled the riders table with 169 name-and-phone shells — never allotted a
// vehicle, never paid, never submitted KYC — which inflated the Available
// Riders count and made the rider list untrustworthy.
//
// Decision (Priyam, 28 Aug 2026): onboarding is ops' job. A lead stays a lead
// in the leads table until someone actually onboards them.
//
// App self-signup is deliberately untouched: a rider who logs into the app with
// a new number still gets a record, because they are about to complete their
// own KYC. That path inserts directly and never used this trigger.
module.exports.up = async ({ client, S, L }) => {
  await client.query(`DROP TRIGGER IF EXISTS rider_from_lead_trg ON ${L}.leads`);
  await client.query(`DROP FUNCTION IF EXISTS ${S}.rider_from_lead()`);
};
