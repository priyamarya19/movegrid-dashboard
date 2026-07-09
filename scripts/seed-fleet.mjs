// Idempotent UAT fleet seeder. Reads scripts/fleet-data.json and upserts
// vehicles, riders, allotments (with re-allotment history) and rent payments.
// Safe to re-run. Never sets investor_id; never deletes.
//
//   node scripts/seed-fleet.mjs
//
// Riders are keyed by MOBILE (unique in the schema): a person who re-onboards
// under a new code in the sheet is the same rider with another allotment.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const OPS = process.env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";
const data = JSON.parse(readFileSync(join(__dirname, "fleet-data.json"), "utf8"));

const weeklyRent = (model) => (model && model.startsWith("EV Juno") ? 1680 : 1610);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const minDate = (...ds) => ds.filter(Boolean).sort()[0] ?? null;

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT) || 5432,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

async function main() {
  const c = await pool.connect();
  const s = { vehIns: 0, vehUpd: 0, ridIns: 0, ridUpd: 0, asgIns: 0, asgUpd: 0, payIns: 0, paySkip: 0 };
  try {
    await c.query("BEGIN");

    const models = (await c.query(`SELECT id, model_name FROM ${OPS}.vehicle_models`)).rows;
    const modelByName = new Map(models.map((m) => [m.model_name, m.id]));
    const hubId = (await c.query(`SELECT id FROM ${OPS}.hubs WHERE hub_name = $1`, [data.hub])).rows[0]?.id ?? null;

    // 1) Vehicles (upsert by ev_number)
    const vehicleIdByEv = new Map();
    const modelByEv = new Map();
    for (const v of data.vehicles) {
      const modelId = modelByName.get(v.model);
      if (!modelId) throw new Error(`Unknown model "${v.model}" for ${v.ev}`);
      modelByEv.set(v.ev, v.model);
      const ex = (await c.query(`SELECT id FROM ${OPS}.vehicles WHERE ev_number=$1`, [v.ev])).rows[0];
      if (ex) {
        await c.query(`UPDATE ${OPS}.vehicles SET chassis_number=$1, model_id=$2, hub_id=$3 WHERE id=$4`, [v.chassis, modelId, hubId, ex.id]);
        vehicleIdByEv.set(v.ev, ex.id); s.vehUpd++;
      } else {
        const ins = await c.query(`INSERT INTO ${OPS}.vehicles (ev_number, chassis_number, model_id, hub_id, status) VALUES ($1,$2,$3,$4,'available') RETURNING id`, [v.ev, v.chassis, modelId, hubId]);
        vehicleIdByEv.set(v.ev, ins.rows[0].id); s.vehIns++;
      }
    }

    // 2) Riders — dedupe by mobile (earliest row is canonical), upsert by mobile.
    const uniqueByMobile = new Map();
    for (const r of data.riders) {
      const prev = uniqueByMobile.get(r.mobile);
      if (!prev || r.date < prev.date) uniqueByMobile.set(r.mobile, r);
    }
    const riderIdByMobile = new Map();
    for (const r of uniqueByMobile.values()) {
      const ex = (await c.query(`SELECT id FROM ${OPS}.riders WHERE mobile=$1`, [r.mobile])).rows[0];
      if (ex) {
        await c.query(
          `UPDATE ${OPS}.riders SET name=$1, employer=$2, business_type='rental', rental_mode=$3, security_deposit=$4, onboarding_fee=$5 WHERE id=$6`,
          [r.name, r.client, r.rental_mode, r.deposit ?? null, r.fee ?? null, ex.id]
        );
        riderIdByMobile.set(r.mobile, ex.id); s.ridUpd++;
      } else {
        const ins = await c.query(
          `INSERT INTO ${OPS}.riders (rider_code, name, mobile, employer, business_type, rental_mode, security_deposit, onboarding_fee, status, created_by)
           VALUES ($1,$2,$3,$4,'rental',$5,$6,$7,'pending','Data import') RETURNING id`,
          [r.code, r.name, r.mobile, r.client, r.rental_mode, r.deposit ?? null, r.fee ?? null]
        );
        riderIdByMobile.set(r.mobile, ins.rows[0].id); s.ridIns++;
      }
    }

    // 3) Allotment events (every sheet row). Resolve rider by mobile.
    const events = data.riders.map((r) => ({
      mobile: r.mobile, riderId: riderIdByMobile.get(r.mobile),
      ev: r.ev, vehicleId: vehicleIdByEv.get(r.ev),
      date: r.date, explicitReturned: r.returnedDate ?? null, collectedWeeks: r.collectedWeeks ?? [],
    }));

    // Reconcile: an assignment is returned when the same VEHICLE is re-allotted
    // OR the same RIDER takes another vehicle (whichever first), else active.
    const activeRiderIds = new Set();
    const activeVehicleEvs = new Set();
    for (const e of events) {
      const nextVeh = minDate(...events.filter((o) => o.ev === e.ev && o.date > e.date).map((o) => o.date));
      const nextRider = minDate(...events.filter((o) => o.mobile === e.mobile && o.date > e.date).map((o) => o.date));
      const closing = minDate(nextVeh, nextRider, e.explicitReturned);
      if (closing) { e.status = "returned"; e.returnedDate = closing; }
      else { e.status = "active"; e.returnedDate = null; activeRiderIds.add(e.riderId); activeVehicleEvs.add(e.ev); }
    }

    // 4) Upsert assignments (idempotent by vehicle_id + rider_id + assigned_date)
    for (const e of events) {
      if (!e.vehicleId || !e.riderId) throw new Error(`Missing vehicle/rider for ${e.mobile} (${e.ev})`);
      const ex = (await c.query(
        `SELECT id FROM ${OPS}.rider_vehicle_assignments WHERE vehicle_id=$1 AND rider_id=$2 AND assigned_date=$3`,
        [e.vehicleId, e.riderId, e.date]
      )).rows[0];
      if (ex) {
        await c.query(`UPDATE ${OPS}.rider_vehicle_assignments SET status=$1, returned_date=$2, hub_id=$3 WHERE id=$4`, [e.status, e.returnedDate, hubId, ex.id]); s.asgUpd++;
      } else {
        await c.query(
          `INSERT INTO ${OPS}.rider_vehicle_assignments (rider_id, vehicle_id, hub_id, assigned_date, status, returned_date, allotted_by)
           VALUES ($1,$2,$3,$4,$5,$6,'Data import')`,
          [e.riderId, e.vehicleId, hubId, e.date, e.status, e.returnedDate]
        ); s.asgIns++;
      }
    }

    // 5) Final statuses
    for (const [ev, vehicleId] of vehicleIdByEv) {
      const status = activeVehicleEvs.has(ev) ? "assigned" : (data.vehicleStatusOverrides?.[ev] ?? "available");
      await c.query(`UPDATE ${OPS}.vehicles SET status=$1 WHERE id=$2`, [status, vehicleId]);
    }
    for (const [mobile, riderId] of riderIdByMobile) {
      await c.query(`UPDATE ${OPS}.riders SET status=$1 WHERE id=$2`, [activeRiderIds.has(riderId) ? "active" : "inactive", riderId]);
    }

    // 6) Payments — Collected weeks, idempotent by rider_id + payment_date + rental_period_start.
    for (const e of events) {
      const amount = weeklyRent(modelByEv.get(e.ev));
      for (const wk of e.collectedWeeks) {
        const dup = await c.query(`SELECT id FROM ${OPS}.rider_payments WHERE rider_id=$1 AND payment_date=$2 AND rental_period_start=$3`, [e.riderId, wk, wk]);
        if (dup.rows[0]) { s.paySkip++; continue; }
        await c.query(
          `INSERT INTO ${OPS}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [e.riderId, e.vehicleId, amount, wk, wk, addDays(wk, 6)]
        ); s.payIns++;
      }
    }

    // 7) Keep rider_code sequence ahead of the highest numeric code present.
    await c.query(
      `SELECT setval('${OPS}.rider_code_seq',
         GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(rider_code, '\\D', '', 'g'), '')::int), 0) FROM ${OPS}.riders), 1), true)`
    );

    await c.query("COMMIT");
    console.log("Seed complete:", JSON.stringify(s, null, 2));
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("Seed FAILED, rolled back:", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
