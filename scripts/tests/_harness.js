// Shared plumbing for the UAT test suites.
//
// These exist because typechecks and builds do not catch the things that have
// actually gone wrong here: a rule applied to rows that predate it, a cached
// value served after the query was fixed, a week drawn a day late. Every suite
// drives the REAL HTTP routes against the REAL UAT schema, then deletes what it
// made.
//
//   RDS_ENV=uat node scripts/tests/run-all.js       # needs `npm run dev` up
//
// REFUSES to run against production. Not a warning, an exit.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const ROOT = path.join(__dirname, "..", "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const RDS_ENV = process.env.RDS_ENV || env.RDS_ENV;
if (RDS_ENV !== "uat") {
  console.error(`REFUSING: RDS_ENV is "${RDS_ENV}". These suites write and delete data — UAT only.`);
  process.exit(1);
}

const S = "mg_data_uat";
const A = "uat_auth";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

// The three cron sweeps (balance expiry, ticket auto-close, location prune) are
// gated on CRON_SECRET, which belongs to the server being tested — not to this
// checkout. Running against the deployed UAT box with the local file's secret
// makes all three 401 and look like a code regression. A shell CRON_SECRET wins.
env.CRON_SECRET = process.env.CRON_SECRET || env.CRON_SECRET;

function connect() {
  return new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
}

/** A suite's running tally. */
function tally(name) {
  const t = { name, pass: 0, fail: 0, failures: [] };
  t.check = (what, ok, detail = "") => {
    if (ok) { t.pass++; console.log(`  ok    ${what}${detail ? "  — " + detail : ""}`); }
    else { t.fail++; t.failures.push(what); console.log(` FAIL  ${what}${detail ? "  — " + detail : ""}`); }
    return ok;
  };
  return t;
}

const uniq = () => String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);

/**
 * Everything a suite needs to exist: a staff login, and whatever riders and
 * vehicles it asks for. Tracks its own leftovers so cleanup cannot miss one.
 */
async function fixtures(c, opts = {}) {
  const tag = uniq();
  const made = { riders: [], vehicles: [], users: [], hubs: [] };

  const hub = (await c.query(`SELECT id FROM ${S}.hubs LIMIT 1`)).rows[0].id;
  const roleId = (await c.query(`SELECT id FROM ${A}.roles WHERE name = $1`, [opts.role ?? "admin"])).rows[0].id;

  const email = `test-${tag}@movegrid.in`;
  const password = `uat-test-${tag}`;
  // can_approve_rent_waivers is a per-user permission that does NOT come with
  // the admin role, so a suite touching waivers has to be granted it explicitly.
  const userId = (await c.query(
    `INSERT INTO ${A}.users (name, email, mobile, password_hash, role_id, status, can_approve_rent_waivers)
     VALUES ($1,$2,$3,$4,$5,'active',true) RETURNING id`,
    [`ZZ Test ${tag}`, email, "+9190" + tag, await bcrypt.hash(password, 10), roleId]
  )).rows[0].id;
  made.users.push(userId);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`staff login failed (${login.status}) — is \`npm run dev\` running on ${BASE}?`);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((x) => x.split(";")[0]).join("; ");
  const staff = { "Content-Type": "application/json", Cookie: cookie };

  async function rider(over = {}) {
    const mobile = over.mobile ?? "+9178" + uniq();
    const id = (await c.query(
      `INSERT INTO ${S}.riders (name, mobile, status, assigned_hub_id, onboarding_fee, security_deposit)
       VALUES ($1,$2,'active',$3,$4,$5) RETURNING id`,
      [over.name ?? `ZZ Rider ${tag}`, mobile, over.hub ?? hub, over.fee ?? 1500, over.deposit ?? 500]
    )).rows[0].id;
    made.riders.push(id);
    return { id, mobile };
  }

  async function vehicle(over = {}) {
    const t = uniq();
    const model = (await c.query(
      `SELECT id FROM ${S}.vehicle_models WHERE is_high_speed = ${over.highSpeed ? "true" : "false"} LIMIT 1`
    )).rows[0].id;
    const id = (await c.query(
      `INSERT INTO ${S}.vehicles (ev_number, chassis_number, model_id, hub_id, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [`ZZ${t}`, `ZZCH${t}`, model, over.hub ?? hub, over.status ?? "ready_to_deploy"]
    )).rows[0].id;
    made.vehicles.push(id);
    return id;
  }

  /** A rider-app bearer token, minted exactly as the OTP route does. */
  async function riderToken(riderId, mobile) {
    const { SignJWT } = require("jose");
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const jwt = await new SignJWT({ riderId, mobile, name: "ZZ Rider", kind: "rider", tv: 0 })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
    return { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` };
  }

  return { tag, hub, staff, userId, made, rider, vehicle, riderToken };
}

/**
 * Delete everything a suite created, child tables first. Best-effort per
 * statement: one missing table must not strand the rest as litter in UAT.
 */
async function cleanup(c, made) {
  const byRider = [
    "rider_locations", "rider_ticket_messages", "rider_tickets", "rider_payments",
    "rider_balance_entries", "revenue_write_offs", "bad_debts", "rider_penalties",
    "rent_dues", "rent_waiver_requests", "rider_vehicle_assignments",
  ];
  for (const id of made.riders ?? []) {
    for (const t of byRider) {
      await c.query(`DELETE FROM ${S}.${t} WHERE rider_id = $1`, [id]).catch(() => {});
    }
    // Ticket messages hang off the ticket, not the rider.
    await c.query(
      `DELETE FROM ${S}.rider_ticket_messages WHERE ticket_id IN (SELECT id FROM ${S}.rider_tickets WHERE rider_id = $1)`,
      [id]
    ).catch(() => {});
    await c.query(`DELETE FROM ${S}.riders WHERE id = $1`, [id]).catch(() => {});
  }
  for (const id of made.vehicles ?? []) {
    await c.query(`DELETE FROM ${S}.vehicle_status_log WHERE vehicle_id = $1`, [id]).catch(() => {});
    await c.query(`DELETE FROM ${S}.vehicles WHERE id = $1`, [id]).catch(() => {});
  }
  for (const id of made.users ?? []) {
    await c.query(`DELETE FROM ${S}.approval_approvers WHERE user_id = $1`, [id]).catch(() => {});
    await c.query(`DELETE FROM ${A}.users WHERE id = $1`, [id]).catch(() => {});
  }
  for (const id of made.hubs ?? []) {
    await c.query(`DELETE FROM ${S}.hubs WHERE id = $1`, [id]).catch(() => {});
  }
}

/** Read back the plaintext of a 6-digit approval code we can't receive by email. */
async function crackApprovalCode(c, requestId, userId = null) {
  const q = userId
    ? await c.query(`SELECT code_hash FROM ${S}.approval_request_codes WHERE request_id=$1 AND user_id=$2`, [requestId, userId])
    : await c.query(`SELECT code_hash FROM ${S}.approval_requests WHERE id=$1`, [requestId]);
  const hash = q.rows[0]?.code_hash;
  if (!hash) return null;
  for (let n = 0; n < 1000000; n++) {
    const cand = String(n).padStart(6, "0");
    if (crypto.createHash("sha256").update(cand).digest("hex") === hash) return cand;
  }
  return null;
}

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

module.exports = { S, A, BASE, env, connect, tally, fixtures, cleanup, crackApprovalCode, istToday, addDays, uniq };
