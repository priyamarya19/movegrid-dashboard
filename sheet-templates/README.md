# MoveGrid data sheets — fill & upload guide

These are the **only** sheets the team should fill. Each one uploads into the dashboard and
updates the database. **The database is the source of truth after upload.**

> Keep the header row exactly as-is. Don't rename or reorder columns. One Google Sheet tab
> per file; export as **CSV** (File → Download → CSV) before uploading.

## Global rules
- **Dates:** `DD/MM/YYYY` (e.g. `08/05/2026`).
- **Mobile:** 10 digits, no spaces. **Mobile is how a rider is matched** across sheets — keep it consistent.
- **Coordinates:** `lat,long` (e.g. `28.594819,77.403026`). Get it from Google Maps → drop a pin → copy.
- **Money:** numbers only, no `₹` or commas.
- Leave a cell **blank** if unknown (don't type `NA`/`0000`).

---

## 1. `1_vehicles.csv` — vehicle inventory (fill once per vehicle)
The physical fleet. **Key = `ev_number`** (re-uploading the same EV updates it).
- `oem`: `Shelby` or `EV Juno`
- `model`: `Shelby BS` / `EV Juno MB` / `EV Juno BS`

## 2. `2_riders.csv` — rider onboarding / KYC (fill once per rider)
**Key = `mobile`.** Leave `rider_code` blank to auto-assign (MG0000xx).
- `plan` (one of): `Weekly-12`, `Weekly-14`, `Monthly`, `MB-Unlimited`, `Above-550km`
  → the weekly rent is set automatically from the plan; you don't enter the rate.
- `ev_number`: the vehicle given to them at onboarding (must exist in sheet 1).
- `home_coordinates`: their home pin — used later for GPS verification.
- Document columns take **Google-Drive links** (front/back where applicable).

## 3. `3_rent_collection.csv` — rent log (add ONE ROW EACH TIME rent is collected)
This **replaces the weekly-columns sheet.** Instead of marking a status under a week,
**append a new row** every time you collect (or every billing period).
- `status`: `Collected` (paid) or `Pending` (due, not paid).
- `mode`: `Cash` / `UPI` / `Bank`.
- `amount`: leave blank to use the rider's plan rate, or enter the actual amount.
- A row is uniquely identified by `rider_mobile` + `due_date` (re-uploading updates that period).

## 4. `4_assignments.csv` — allotment / return / swap events (add a row per event)
Every time a vehicle changes hands. **This is where "vehicle submitted/returned" goes** —
do NOT put returns in the rent sheet anymore.
- `action`: `Allot` (rider takes a bike), `Return` (rider gives it back), `Swap` (return + new allot).
- For `Return`, `ev_number` = the bike being returned; `client` can be blank.

---

## How upload works (in the dashboard)
1. Admin/Ops opens **Data → Upload Sheet**.
2. Picks the sheet type (Vehicles / Riders / Rent / Assignments) and the CSV.
3. The dashboard shows a **preview + validation** (errors flagged: bad dates, unknown EV/rider, duplicates).
4. On confirm, it **upserts** into the DB. Existing records update; new ones are added; nothing is deleted.

## What NOT to do
- Don't keep separate private copies — always work in the shared sheets.
- Don't delete past rent rows; corrections = re-upload the same row with fixed values.
- Don't invent new columns; tell the admin if a field is missing and it'll be added centrally.
