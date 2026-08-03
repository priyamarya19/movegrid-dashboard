// Rider-type leads ARE not-yet-onboarded riders: every rider lead auto-creates
// a rider record (status pending, KYC empty) — same shape as app self-signup.
// DB trigger handles future leads regardless of which service inserts them
// (website, dashboard); a one-time backfill converts the existing ones.
// Dedupe by 10-digit mobile core against the riders table.
module.exports.up = async ({ client, S, L }) => {
  await client.query(`
    CREATE OR REPLACE FUNCTION ${S}.rider_from_lead() RETURNS trigger AS $fn$
    DECLARE core text;
    BEGIN
      IF NEW.type = 'rider' THEN
        core := RIGHT(REGEXP_REPLACE(COALESCE(NEW.phone, ''), '\\D', '', 'g'), 10);
        IF LENGTH(core) = 10 AND NOT EXISTS (
          SELECT 1 FROM ${S}.riders r
          WHERE RIGHT(REGEXP_REPLACE(r.mobile, '\\D', '', 'g'), 10) = core
        ) THEN
          INSERT INTO ${S}.riders (name, mobile, status, rider_code, created_by)
          VALUES (
            COALESCE(NULLIF(TRIM(NEW.name), ''), 'New Rider'), core, 'pending',
            'MGR' || LPAD(NEXTVAL('${S}.rider_code_seq')::TEXT, 6, '0'), 'lead-auto'
          );
        END IF;
      END IF;
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql`);
  await client.query(`DROP TRIGGER IF EXISTS rider_from_lead_trg ON ${L}.leads`);
  await client.query(`
    CREATE TRIGGER rider_from_lead_trg AFTER INSERT ON ${L}.leads
    FOR EACH ROW EXECUTE FUNCTION ${S}.rider_from_lead()`);

  // Backfill existing rider leads (one rider per distinct mobile).
  await client.query(`
    INSERT INTO ${S}.riders (name, mobile, status, rider_code, created_by)
    SELECT x.name, x.core, 'pending',
           'MGR' || LPAD(NEXTVAL('${S}.rider_code_seq')::TEXT, 6, '0'), 'lead-backfill'
    FROM (
      SELECT DISTINCT ON (RIGHT(REGEXP_REPLACE(COALESCE(l.phone,''), '\\D', '', 'g'), 10))
        COALESCE(NULLIF(TRIM(l.name), ''), 'New Rider') AS name,
        RIGHT(REGEXP_REPLACE(COALESCE(l.phone,''), '\\D', '', 'g'), 10) AS core
      FROM ${L}.leads l
      WHERE l.type = 'rider'
      ORDER BY RIGHT(REGEXP_REPLACE(COALESCE(l.phone,''), '\\D', '', 'g'), 10), l.created_at DESC
    ) x
    WHERE LENGTH(x.core) = 10 AND NOT EXISTS (
      SELECT 1 FROM ${S}.riders r
      WHERE RIGHT(REGEXP_REPLACE(r.mobile, '\\D', '', 'g'), 10) = x.core
    )`);
};
