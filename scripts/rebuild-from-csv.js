// Full rebuild of rider-operations data from the ops sheets (CSV exports).
//
//   node scripts/rebuild-from-csv.js            # dry run: report only, no writes
//   node scripts/rebuild-from-csv.js --apply    # wipe + rebuild inside one transaction
//
// The sheets are the source of truth (see AGENTS/memory). This wipes and rebuilds:
//   vehicle_models, vehicles, riders, rider_vehicle_assignments, rider_payments,
//   rider_penalties, rent_waiver_requests, vehicle_repairs, rent_dues
// and preserves: hubs, report_recipients, auth users (minus the Test Investor).
//
// Identity model:
//   - Rider ID (riders.rider_code): MGR000010+, one per person, ordered by earliest
//     allotment date (rent sheet), ties by sheet row; never-allotted riders after,
//     by KYC/backup creation time.
//   - Allotment ID (assignments.allotment_code): the rent sheet's User ID column.
//     One sheet row = one continuous tenancy; a same-day return+re-allotment inside
//     a tenancy is an issue swap -> extra assignment row sharing the allotment_code,
//     linked via continues_from_assignment_id so the rent week cadence continues.
//
// Rider-level fields with no CSV source (onboarding_fee, security_deposit, employer,
// nickname, business_type, created_at) are carried over from the pre-rebuild backup
// by phone, so rider data is maintained across the rebuild.
//
// After --apply, run: node scripts/phase1-rent-ledger.js  (regenerates rent_dues)

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const DIR = path.join(__dirname, "..", "data update");
const BACKUP = path.join(__dirname, "..", "backups", "uat-backup-2026-07-11-pre-rebuild.json");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const rdsEnv = process.env.RDS_ENV || env.RDS_ENV;
const S = rdsEnv === "uat" ? "mg_data_uat" : "mg_data";
const A = rdsEnv === "uat" ? "uat_auth" : "auth";
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

const HUB_ID = "fc9f895e-92f4-4b8a-8630-63aea595f72b";
const FIRST_RIDER_NUM = 10; // first rider = MGR000010

// ---------- helpers ----------
function parseCSV(file) {
  const text = fs.readFileSync(path.join(DIR, file), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  return lines.map((line) => {
    const out = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  });
}
// Known data-entry typos in the sheets, confirmed by cross-referencing every CSV:
//  - Aman Pratap's submission row says 7893872559; every other file says 7393872559.
//  - The KYC form lists Gopal jha under 9319716945; his real number is 9958744242
//    (user-confirmed; the wrong-phone KYC row otherwise creates a phantom rider).
//  - The vehicle onboarding form has MG0429N0043; all other files say MG0426N0043.
const PHONE_FIX = { "7893872559": "7393872559", "9319716945": "9958744242" };
const EV_FIX = { "MG0429N0043": "MG0426N0043" };
const np = (p) => { const n = (p || "").replace(/\D/g, "").slice(-10); return PHONE_FIX[n] || n; };
const T = (s) => (s || "").trim();
const EV = (s) => EV_FIX[T(s)] || T(s);
// dd/mm/yyyy -> yyyy-mm-dd
function dmy(s) {
  const m = T(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const anomalies = [];
const note = (msg) => { anomalies.push(msg); };

// ---------- load sources ----------
const sheetRaw = parseCSV("Rent sheet - Rent collection date Jul (2).csv").slice(2).filter((r) => np(r[4]));
const form = parseCSV("Rider Allotment form (Responses) - Form responses 1 (2).csv").slice(1).filter((r) => np(r[3]));
const hub = parseCSV("Hub Fleet Data - Hub Data.csv").slice(2).filter((r) => T(r[2]));
const kyc = parseCSV("Rider KYC form (Responses) - Form responses 1 (2).csv").slice(1).filter((r) => np(r[2]));
const addr = parseCSV("Hub Fleet Data - Rider Address details.csv").slice(1).filter((r) => np(r[2]));
const onboard = parseCSV("Scooter_Vehicle onboarding form (Responses) - Form responses 1 (2).csv").slice(1).filter((r) => T(r[1]));
const scooters = parseCSV("Hub Fleet Data - NEW Scooters Details .csv").slice(1).filter((r) => T(r[2]));
const submissions = parseCSV("Vehicle Submission Form (Responses) - Form responses 1 (2).csv").slice(1).filter((r) => np(r[2]));
const repairs = parseCSV("Hub Fleet Data - Sheet2.csv").slice(1).filter((r) => T(r[1]) && (T(r[3]) || T(r[4])));
const backup = JSON.parse(fs.readFileSync(BACKUP, "utf8")).schemas[S === "mg_data" ? "mg_data" : "mg_data_uat"];
const backupRidersByPhone = {};
for (const r of backup.riders) backupRidersByPhone[np(r.mobile)] = r;

// ---------- vehicles + models ----------
const MODEL_RATE = { "EV Juno BS": 240, "EV Juno MB": 240, "NXTE MB": 260, "Shelby BS": 240 };
const modelByEv = {};   // ev -> model_name (from hub data)
for (const h of hub) if (T(h[4])) modelByEv[EV(h[2])] = T(h[4]);

const vehicles = {}; // ev -> fields
for (const o of onboard) {
  const ev = EV(o[1]);
  vehicles[ev] = {
    ev, chassis: T(o[2]) || null, oem: T(o[3]) || null, motor: T(o[4]) || null,
    controller: T(o[5]) || null, iot_imei: T(o[6]) || null, iot_partner: T(o[7]) || null,
    battery_number: T(o[8]) || null, battery_partner: T(o[9]) || null,
  };
}
for (const s of scooters) {
  const ev = EV(s[2]);
  if (!vehicles[ev]) vehicles[ev] = { ev, chassis: T(s[4]) || null, oem: T(s[3]) || null, motor: T(s[5]) || null, controller: T(s[6]) || null, iot_imei: T(s[7]) || null, iot_partner: null, battery_number: T(s[8]) || null, battery_partner: null };
}
for (const h of hub) {
  const ev = EV(h[2]);
  if (!vehicles[ev]) { vehicles[ev] = { ev, chassis: T(h[3]) || null, oem: null, motor: null, controller: null, iot_imei: null, iot_partner: null, battery_number: null, battery_partner: null }; note(`vehicle ${ev} only found in Hub Data (no onboarding/scooter details row)`); }
}
for (const ev of Object.keys(vehicles)) {
  vehicles[ev].model_name = modelByEv[ev] || null;
  if (!vehicles[ev].model_name) note(`vehicle ${ev} has no model in Hub Data`);
}
// vehicle status from hub data: latest row per EV by allotment date (or row order)
const HUB_STATUS = { "Alloted": "assigned", "Submitted": "returned", "RTD": "ready_to_deploy", "UM": "under_maintenance" };
const hubStatusByEv = {};
for (const h of hub) hubStatusByEv[EV(h[2])] = HUB_STATUS[T(h[6])] || null; // later rows win
for (const [ev, st] of Object.entries(hubStatusByEv)) if (!st) note(`vehicle ${ev}: unknown hub status`);

// ---------- riders ----------
// tenancies = rent sheet rows, in sheet order
const tenancies = sheetRaw.map((r) => ({
  srNo: T(r[0]), code: T(r[1]), date: dmy(r[2]), name: T(r[3]), phone: np(r[4]),
  weekly: Number(T(r[6])) || null,
  // pairs: [dueDate, status] weeks 1..11 at cols 7..28
  weeks: Array.from({ length: 11 }, (_, i) => ({ due: dmy(r[7 + i * 2]), status: T(r[8 + i * 2]) })).filter((w) => w.due),
  notes: r.slice(30).map(T).filter(Boolean).join(" | ") || null,
}));

const riderOrder = []; // phones in MGR order
const riderMeta = {};  // phone -> {name, firstAllotment}
for (const t of tenancies) {
  if (!riderMeta[t.phone]) { riderMeta[t.phone] = { name: t.name, firstAllotment: t.date }; riderOrder.push(t.phone); }
}
// order allotted riders by (first allotment date, sheet order) — sheet is already
// date-ordered but sort defensively, stable on current order
riderOrder.sort((a, b) => (riderMeta[a].firstAllotment < riderMeta[b].firstAllotment ? -1 : riderMeta[a].firstAllotment > riderMeta[b].firstAllotment ? 1 : 0));

// never-allotted riders: in KYC (or backup) but not in the rent sheet
const kycByPhone = {};
for (const k of kyc) if (!kycByPhone[np(k[2])]) kycByPhone[np(k[2])] = k;
const extraRiders = [];
for (const k of kyc) {
  const p = np(k[2]);
  if (!riderMeta[p] && !extraRiders.find((e) => e.phone === p)) extraRiders.push({ phone: p, name: T(k[1]), ts: dmy(k[0]) || T(k[0]) });
}
for (const b of backup.riders) {
  const p = np(b.mobile);
  if (!riderMeta[p] && !extraRiders.find((e) => e.phone === p)) { extraRiders.push({ phone: p, name: b.name, ts: b.created_at }); note(`rider ${b.name} (${p}) exists only in backup (no CSV source) — recreated from backup`); }
}
extraRiders.sort((a, b) => (a.ts < b.ts ? -1 : 1));
for (const e of extraRiders) { riderMeta[e.phone] = { name: e.name, firstAllotment: null }; riderOrder.push(e.phone); }

const addrByPhone = {};
for (const a of addr) addrByPhone[np(a[2])] = { address: T(a[3]) || null, map: T(a[4]) || null };
const nickByPhone = {};
for (const f of form) if (T(f[2]) && !nickByPhone[np(f[3])]) nickByPhone[np(f[3])] = T(f[2]);

const isPlaceholder = (v) => !T(v) || /^0+$/.test(T(v)) || /E\+\d+/i.test(T(v));
function riderRecord(phone, mgrCode) {
  const meta = riderMeta[phone];
  const k = kycByPhone[phone];
  const b = backupRidersByPhone[phone];
  const ad = addrByPhone[phone];
  const split = (urls) => T(urls).split(",").map(T).filter(Boolean);
  const aadhaar = k ? split(k[5]) : [];
  return {
    rider_code: mgrCode, name: meta.name, mobile: phone,
    nickname: nickByPhone[phone] || (b && b.nickname) || null,
    current_address: (ad && ad.address) || (k && T(k[3])) || (b && b.current_address) || null,
    address_map_link: (ad && ad.map) || (k && T(k[4])) || (b && b.address_map_link) || null,
    aadhaar_front_url: aadhaar[0] || null, aadhaar_back_url: aadhaar[1] || null,
    pan_image_url: (k && T(k[6])) || null, bank_doc_url: (k && T(k[7])) || null,
    bank: k && !isPlaceholder(k[8]) ? T(k[8]) : null,
    account_number: k && !isPlaceholder(k[9]) ? T(k[9]) : null,
    ifsc: k && !isPlaceholder(k[10]) ? T(k[10]) : null,
    family_ref_name: k && T(k[11]) ? T(k[11]) : (b && b.family_ref_name) || null,
    family_ref_aadhaar_url: (k && T(k[12])) || null,
    family_ref_mobile: k && np(k[13]) ? np(k[13]) : (b && b.family_ref_mobile) || null,
    dl_number: k && T(k[14]) ? T(k[14]) : (b && b.dl_number) || null,
    local_ref_name: k && T(k[16]) ? T(k[16]) : (b && b.local_ref_name) || null,
    local_ref_mobile: k && np(k[17]) ? np(k[17]) : (b && b.local_ref_mobile) || null,
    created_by: (k && T(k[15])) || (b && b.created_by) || null,
    // maintained from backup (no CSV source):
    onboarding_fee: b ? b.onboarding_fee : null,
    security_deposit: b ? b.security_deposit : null,
    employer: b ? b.employer : null,
    rental_mode: (b && b.rental_mode) || "weekly",
    business_type: (b && b.business_type) || "rental",
    created_at: (b && b.created_at) || null,
    assigned_hub_id: HUB_ID,
  };
}

// ---------- allotment events per phone (form rows + hub-only pairings) ----------
const eventsByPhone = {};
for (const f of form) {
  const p = np(f[3]);
  (eventsByPhone[p] = eventsByPhone[p] || []).push({
    date: dmy(f[13]) || dmy(f[0]), ev: EV(f[4]),
    amount_collected: (() => { const m = T(f[11]).match(/\d+/); return m ? Number(m[0]) : null; })(),
    amount_raw: T(f[11]) || null,
    payment_screenshot_url: T(f[12]) || null, allotted_by: T(f[14]) || null,
    allotment_pics: T(f[15]) || null,
  });
}
for (const h of hub.filter((r) => ["Alloted", "Submitted"].includes(T(r[6])))) {
  const p = np(h[8]); const ev = EV(h[2]); const d = dmy(h[9]);
  const evs = eventsByPhone[p] || [];
  if (!evs.find((e) => e.ev === ev)) {
    (eventsByPhone[p] = evs).push({ date: d, ev, amount_collected: null, amount_raw: null, payment_screenshot_url: null, allotted_by: null, allotment_pics: null });
    note(`allotment ${p} -> ${ev} on ${d} taken from Hub Data (no allotment form row)`);
  }
}
for (const p of Object.keys(eventsByPhone)) eventsByPhone[p].sort((a, b) => (a.date < b.date ? -1 : 1));

// submissions by phone+ev
const subByKey = {};
for (const s of submissions) {
  subByKey[np(s[2]) + "|" + EV(s[4])] = {
    returned_date: dmy(s[10]) || dmy(s[0]),
    rent_cleared: /^y/i.test(T(s[5])),
    penalty_amount: (() => { const m = T(s[6]).match(/\d+/); const n = m ? Number(m[0]) : 0; return n > 0 ? n : null; })(),
    condition: T(s[7]) || null, photos: T(s[8]) || null, remarks: T(s[11]) || null, returned_by: T(s[12]) || null,
  };
}

// ---------- build assignments per tenancy ----------
// Each tenancy owns the events that fall on/after its start and before the next
// tenancy's start (per phone). >1 event in a tenancy = issue-swap chain.
const tenByPhone = {};
for (const t of tenancies) (tenByPhone[t.phone] = tenByPhone[t.phone] || []).push(t);
for (const p of Object.keys(tenByPhone)) tenByPhone[p].sort((a, b) => (a.date < b.date ? -1 : 1));

const assignments = []; // in insert order (chains adjacent, chain link by index)
const payments = [];
const penalties = [];
for (const t of tenancies) {
  const list = tenByPhone[t.phone];
  const idx = list.indexOf(t);
  const nextStart = idx + 1 < list.length ? list[idx + 1].date : "9999-12-31";
  const evs = (eventsByPhone[t.phone] || []).filter((e) => e.date >= t.date && e.date < nextStart);
  if (evs.length === 0) { note(`tenancy ${t.code} ${t.name}: NO vehicle event found — skipped`); continue; }
  if (evs[0].date !== t.date) note(`tenancy ${t.code} ${t.name}: first event date ${evs[0].date} != sheet date ${t.date}`);

  const dailyRent = t.weekly ? t.weekly / 7 : null;
  const collected = t.weeks.filter((w) => w.status === "Collected").length;
  const paidThrough = addDays(t.date, 6 + 7 * collected);
  const chain = [];
  for (const [i, e] of evs.entries()) {
    const sub = subByKey[t.phone + "|" + e.ev];
    const a = {
      _key: t.phone + "|" + e.ev, phone: t.phone, ev: e.ev,
      allotment_code: t.code, assigned_date: e.date, daily_rent: dailyRent,
      amount_collected: i === 0 ? e.amount_collected : e.amount_collected, amount_raw: e.amount_raw,
      payment_screenshot_url: e.payment_screenshot_url, allotted_by: e.allotted_by, allotment_pics: e.allotment_pics,
      chain_prev: i > 0 ? chain[i - 1] : null,
      is_swap_continuation: i > 0,
      sheet_note: i === evs.length - 1 ? t.notes : null,
      status: sub ? "returned" : "active",
      returned_date: sub ? sub.returned_date : null,
      rent_cleared: sub ? sub.rent_cleared : null,
      penalty_amount: sub ? sub.penalty_amount : null,
      condition_on_return: sub && sub.condition ? [sub.condition] : null,
      return_remarks: sub ? sub.remarks : null,
      returned_by: sub ? sub.returned_by : null,
      paid_through_date: null, // set on chain tail below
    };
    if (i > 0) {
      const prev = chain[i - 1];
      if (!prev.returned_date) note(`swap chain ${t.code} ${t.name}: prior vehicle ${prev.ev} has no submission row but a new vehicle ${e.ev} was allotted`);
      else if (prev.returned_date !== e.date) note(`swap chain ${t.code} ${t.name}: return ${prev.ev} on ${prev.returned_date} but new vehicle ${e.ev} on ${e.date} (not same-day; treated as swap since same tenancy row)`);
    }
    chain.push(a);
    assignments.push(a);
    if (sub && sub.penalty_amount) {
      penalties.push({ phone: t.phone, ev: e.ev, _asg: a, amount: sub.penalty_amount, detail: sub.remarks || String(sub.penalty_amount), created_by: sub.returned_by || null, created_at: sub.returned_date });
    }
  }
  const tail = chain[chain.length - 1];
  // Sheet shows the tenancy ended (Submitted weeks) but there's no submission form
  // row: fall back to the ops-entered returned_date preserved in the backup, else
  // approximate with the first Submitted due date. Never leave a dead tenancy active.
  if (tail.status === "active" && t.weeks.some((w) => w.status === "Submitted")) {
    const bAsg = backup.rider_vehicle_assignments.find((ba) => {
      const br = backup.riders.find((r) => r.id === ba.rider_id);
      const bv = backup.vehicles.find((v) => v.id === ba.vehicle_id);
      return br && bv && np(br.mobile) === t.phone && bv.ev_number === tail.ev && ba.returned_date;
    });
    tail.status = "returned";
    // backup date columns were serialized as UTC-shifted timestamps (IST midnight
    // -> previous day 18:30Z); add 5.5h back before taking the date part
    const bdate = (v) => new Date(new Date(v).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    tail.returned_date = bAsg ? bdate(bAsg.returned_date) : t.weeks.find((w) => w.status === "Submitted").due;
    if (bAsg) { tail.rent_cleared = bAsg.rent_cleared; tail.return_remarks = bAsg.return_remarks; tail.returned_by = bAsg.returned_by; }
    note(`tenancy ${t.code} ${t.name}: no submission row; returned_date ${tail.returned_date} taken from ${bAsg ? "backup" : "first Submitted week"}`);
  }
  // The whole chain shares one rent stream, so every member carries the tenancy's
  // paid-through — NOT its own returned_date. Otherwise a mid-week swap makes the
  // old vehicle's final week look "Partial" when the sheet says it was Collected.
  for (const a of chain) a.paid_through_date = paidThrough;
  // active tenancy sanity: last chain member should be active iff hub says Alloted
  if (tail.status === "active" && hubStatusByEv[tail.ev] !== "assigned") note(`tenancy ${t.code} ${t.name}: no submission row but hub says vehicle ${tail.ev} is ${hubStatusByEv[tail.ev]}`);
  // "Submitted" weeks with no submission row anywhere in chain
  if (t.weeks.some((w) => w.status === "Submitted") && !chain.some((a) => a.returned_date)) note(`tenancy ${t.code} ${t.name}: sheet shows Submitted weeks but no submission form row`);

  // payments: week-1 advance at allotment + one per Collected due
  if (t.weekly) {
    payments.push({ phone: t.phone, ev: chain[0].ev, amount: t.weekly, date: t.date, start: t.date, end: addDays(t.date, 6) });
    for (const w of t.weeks) {
      if (w.status !== "Collected") continue;
      const covers = addDays(w.due, 1);
      const vehAsg = [...chain].reverse().find((a) => a.assigned_date <= covers) || chain[0];
      payments.push({ phone: t.phone, ev: vehAsg.ev, amount: t.weekly, date: w.due, start: covers, end: addDays(w.due, 7) });
    }
  }
}
// submissions that matched no assignment
for (const [key, sub] of Object.entries(subByKey)) {
  if (!assignments.find((a) => a._key === key)) note(`submission row unmatched to any assignment: ${key} returned ${sub.returned_date}`);
}
// penalties: overlay status/payment fields from backup by (phone, amount)
const backupPenalties = backup.rider_penalties.map((p) => {
  const rider = backup.riders.find((r) => r.id === p.rider_id);
  return { ...p, phone: rider ? np(rider.mobile) : null };
});
for (const pen of penalties) {
  const match = backupPenalties.find((b) => b.phone === pen.phone && Number(b.amount) === Number(pen.amount) && !b._used);
  if (match) { match._used = true; pen.status = match.status; pen.payment_mode = match.payment_mode; pen.payment_proof_url = match.payment_proof_url; pen.paid_at = match.paid_at; pen.payment_utr = match.payment_utr; pen.detail = match.detail && match.detail !== String(match.amount) ? match.detail : pen.detail; }
  else pen.status = "pending";
}
for (const b of backupPenalties) if (!b._used) note(`backup penalty not recreated from CSVs (likely app-entered): ${b.phone} amount=${b.amount} detail=${JSON.stringify(b.detail)} status=${b.status} — re-added from backup`);
const extraPenalties = backupPenalties.filter((b) => !b._used);

// ---------- report ----------
console.log(`Schema: ${S} | mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
console.log(`vehicle_models: ${Object.keys(MODEL_RATE).length}`);
console.log(`vehicles: ${Object.keys(vehicles).length}`);
console.log(`riders: ${riderOrder.length} (${riderOrder.length - extraRiders.length} allotted + ${extraRiders.length} never-allotted)`);
console.log(`assignments: ${assignments.length} across ${tenancies.length} tenancies (${assignments.filter((a) => a.is_swap_continuation).length} swap continuations)`);
console.log(`payments: ${payments.length}`);
console.log(`penalties: ${penalties.length} from submissions + ${extraPenalties.length} carried from backup`);
console.log(`repairs: ${repairs.length}`);
console.log(`\nMGR codes: ${riderOrder.slice(0, 3).map((p, i) => riderMeta[p].name + "=MGR" + String(FIRST_RIDER_NUM + i).padStart(6, "0")).join(", ")} ... last=${riderMeta[riderOrder[riderOrder.length - 1]].name}=MGR${String(FIRST_RIDER_NUM + riderOrder.length - 1).padStart(6, "0")}`);
console.log(`\n--- anomalies (${anomalies.length}) ---`);
for (const a of anomalies) console.log("  ! " + a);

if (!APPLY) { console.log("\nDry run only. Re-run with --apply to execute."); process.exit(0); }

// ---------- apply ----------
(async () => {
  await client.connect();
  await client.query("BEGIN");
  try {
    // schema additions
    await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS allotment_code text`);
    await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS sheet_note text`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rva_allotment_code ON ${S}.rider_vehicle_assignments(allotment_code)`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS ${S}.allotment_code_seq`);

    // wipe (DELETE, never TRUNCATE), children first
    for (const t of ["rent_dues", "rider_payments", "rider_penalties", "rent_waiver_requests", "vehicle_repairs", "rider_vehicle_assignments", "riders", "vehicles", "vehicle_models"]) {
      const r = await client.query(`DELETE FROM ${S}.${t}`);
      console.log(`wiped ${t}: ${r.rowCount} rows`);
    }
    await client.query(`DELETE FROM ${A}.users WHERE email = 'investor@movegrid.in'`);
    console.log("removed Test Investor login");

    // models
    const modelIds = {};
    for (const [name, rate] of Object.entries(MODEL_RATE)) {
      const oem = name.startsWith("EV Juno") ? "EV Juno" : name.startsWith("NXTE") ? "NXTE" : "Shelby";
      const r = await client.query(`INSERT INTO ${S}.vehicle_models (model_name, oem, rental_per_day, is_high_speed) VALUES ($1,$2,$3,false) RETURNING id`, [name, oem, rate]);
      modelIds[name] = r.rows[0].id;
    }
    console.log(`inserted ${Object.keys(modelIds).length} vehicle_models`);

    // vehicles
    const vehicleIds = {};
    for (const v of Object.values(vehicles)) {
      const status = hubStatusByEv[v.ev] || "ready_to_deploy";
      const r = await client.query(`
        INSERT INTO ${S}.vehicles (ev_number, chassis_number, motor_number, controller_number, status, model_id, hub_id, iot_imei, iot_partner, battery_number, battery_partner)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [v.ev, v.chassis, v.motor, v.controller, status, v.model_name ? modelIds[v.model_name] : null, HUB_ID, v.iot_imei, v.iot_partner, v.battery_number, v.battery_partner]);
      vehicleIds[v.ev] = r.rows[0].id;
    }
    console.log(`inserted ${Object.keys(vehicleIds).length} vehicles`);

    // riders
    const riderIds = {};
    const riderStatus = {};
    for (const [i, phone] of riderOrder.entries()) {
      const code = "MGR" + String(FIRST_RIDER_NUM + i).padStart(6, "0");
      const rec = riderRecord(phone, code);
      const hasActive = assignments.some((a) => a.phone === phone && a.status === "active");
      const hasAny = assignments.some((a) => a.phone === phone);
      rec.status = hasActive ? "active" : hasAny ? "inactive" : "pending";
      riderStatus[phone] = rec.status;
      const cols = Object.keys(rec).filter((k) => rec[k] !== undefined);
      const r = await client.query(
        `INSERT INTO ${S}.riders (${cols.join(",")}) VALUES (${cols.map((_, j) => "$" + (j + 1)).join(",")}) RETURNING id`,
        cols.map((k) => rec[k]));
      riderIds[phone] = r.rows[0].id;
    }
    console.log(`inserted ${Object.keys(riderIds).length} riders`);

    // assignments (chains in order so prev ids exist)
    const asgIds = new Map();
    for (const a of assignments) {
      const r = await client.query(`
        INSERT INTO ${S}.rider_vehicle_assignments (
          rider_id, vehicle_id, hub_id, assigned_date, status, daily_rent, paid_through_date,
          allotment_code, sheet_note, amount_collected, payment_screenshot_url, allotted_by,
          returned_date, rent_cleared, penalty_amount, condition_on_return, return_remarks, returned_by,
          continues_from_assignment_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
        [riderIds[a.phone], vehicleIds[a.ev], HUB_ID, a.assigned_date, a.status, a.daily_rent, a.paid_through_date,
         a.allotment_code, a.sheet_note, a.amount_collected, a.payment_screenshot_url, a.allotted_by,
         a.returned_date, a.rent_cleared, a.penalty_amount, a.condition_on_return, a.return_remarks, a.returned_by,
         a.chain_prev ? asgIds.get(a.chain_prev) : null]);
      asgIds.set(a, r.rows[0].id);
    }
    console.log(`inserted ${asgIds.size} assignments`);

    // payments
    for (const p of payments) {
      await client.query(`
        INSERT INTO ${S}.rider_payments (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [riderIds[p.phone], vehicleIds[p.ev], p.amount, p.date, p.start, p.end]);
    }
    console.log(`inserted ${payments.length} payments`);

    // penalties (from submissions, with backup overlay) + backup-only extras
    for (const pen of penalties) {
      await client.query(`
        INSERT INTO ${S}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by, created_at, payment_mode, payment_proof_url, paid_at, payment_utr)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [riderIds[pen.phone], vehicleIds[pen.ev], asgIds.get(pen._asg), pen.amount, pen.detail, pen.status, pen.created_by, pen.created_at, pen.payment_mode || null, pen.payment_proof_url || null, pen.paid_at || null, pen.payment_utr || null]);
    }
    for (const b of extraPenalties) {
      if (!b.phone || !riderIds[b.phone]) { console.log(`  ! backup penalty dropped (rider not rebuilt): ${b.phone} ${b.amount}`); continue; }
      const bev = backup.vehicles.find((v) => v.id === b.vehicle_id);
      const asg = assignments.find((a) => a.phone === b.phone && bev && a.ev === bev.ev_number);
      await client.query(`
        INSERT INTO ${S}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by, created_at, payment_mode, payment_proof_url, paid_at, payment_utr)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [riderIds[b.phone], bev ? vehicleIds[bev.ev_number] : null, asg ? asgIds.get(asg) : null, b.amount, b.detail, b.status, b.created_by, b.created_at, b.payment_mode, b.payment_proof_url, b.paid_at, b.payment_utr]);
    }
    console.log(`inserted ${penalties.length + extraPenalties.length} penalties`);

    // repairs (Sheet2): match rider by name among the vehicle's riders
    let repairCount = 0;
    for (const r of repairs) {
      const ev = EV(r[1]); const riderName = T(r[2]);
      const cand = assignments.filter((a) => a.ev === ev).map((a) => a.phone)
        .find((p) => riderMeta[p] && riderMeta[p].name.toLowerCase().startsWith(riderName.toLowerCase().slice(0, 5)));
      await client.query(`
        INSERT INTO ${S}.vehicle_repairs (vehicle_id, rider_id, rider_name_raw, part_name, amount, repair_date, payment_mode, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [vehicleIds[ev] || null, cand ? riderIds[cand] : null, riderName, T(r[3]) || "Unspecified", Number(T(r[4])) || null, dmy(r[5]), T(r[6]) || null, T(r[8] || r[7]) || null]);
      repairCount++;
    }
    console.log(`inserted ${repairCount} repairs`);

    // sequences: riders continue after last MGR number; allotment codes after sheet max
    await client.query(`SELECT setval('${S}.rider_code_seq', $1, true)`, [FIRST_RIDER_NUM + riderOrder.length - 1]);
    const maxAllot = Math.max(...tenancies.map((t) => Number(t.code.replace(/\D/g, ""))));
    await client.query(`SELECT setval('${S}.allotment_code_seq', $1, true)`, [maxAllot]);
    console.log(`rider_code_seq -> ${FIRST_RIDER_NUM + riderOrder.length - 1} | allotment_code_seq -> ${maxAllot}`);

    await client.query("COMMIT");
    console.log("\n✅ Rebuild applied. Now run: node scripts/phase1-rent-ledger.js");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", e.message);
    process.exit(1);
  } finally { await client.end(); }
})();
