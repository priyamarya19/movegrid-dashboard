# Rent Sheet → Database Guide

How to read the weekly **rent collection Google Sheet** and turn it into the DB
records that drive every rent figure on the dashboard (collected / expected /
pending, per-rider cycle, overdue list).

> **Golden rule: rent is always paid one week in advance.** This is the single
> fact that everything below depends on. Get it wrong and every paid week shifts,
> so paid weeks read as overdue.

---

## 1. What one sheet row looks like

Each rider is one row. When transcribing, capture these fields (in order):

| Field | Example | Notes |
|-------|---------|-------|
| User ID | `MG000057` | Rider code |
| Name | `Pawan Kumar 01` | |
| Mobile | `8439616892` | The join key to the DB (`riders.mobile`) |
| Allotment date | `19/06/2026` | `dd/mm/yyyy`. Start of **rental week 1** |
| Weekly rent | `1680` | ₹/week. `daily_rent = weekly / 7` |
| Status string | `P..........` | One character **per collection**, left → right |

In code this is the `R` array in [`scripts/sync-full.mjs`](scripts/sync-full.mjs) —
one entry per row: `["MG000057","Pawan Kumar 01","8439616892","19/06/2026",1680,"P.........."]`.

### Status characters

| Char | Meaning |
|------|---------|
| `C` | Collected — this renewal was paid |
| `P` | Pending — this renewal was due but not paid |
| `S` | Submitted — the vehicle was returned this week (rent stops here) |
| `.` | Blank — not recorded yet / not reached |

---

## 2. The one-week-in-advance model (critical)

- **Rental week 1** = `allot` → `allot + 6` days. It is **prepaid at onboarding**,
  so it is **always Collected** and is **NOT shown in the status string.**
- The **first character** of the status string is the collection made at the
  **end of week 1** (≈ `allot + 6`), which pays for **rental week 2**.
- In general, **status position `i` (0-based) funds rental week `i + 2`.**

So for `Pawan Kumar 01`, allotted 19 Jun, string `P..........`:

| Rental week | Period | Where it comes from | Result |
|-------------|--------|---------------------|--------|
| Week 1 | 19–25 Jun | Onboarding advance (not in string) | **Collected** |
| Week 2 | 26 Jun–02 Jul | String position 0 = `P` | Pending / owed |
| Week 3 | 03–09 Jul | String position 1 = `.` (blank, but week has started) | Owed |

⚠️ **Common bug:** mapping the first status character to *week 1*. That drops the
onboarding advance and shifts every mark one week early, making recent `P...`
onboards show a false "week 1 overdue".

---

## 3. How each row becomes DB rows

For every rider row, `sync-full.mjs` writes:

**a) Rate** — `rider_vehicle_assignments.daily_rent = weekly / 7`
  - `1680 → ₹240/day` (Shelby & EV Juno, standard)
  - `1820 → ₹260/day` (NXTE / premium)

**b) Payments** (`rider_payments`), period-aligned so `lib/rent.ts` can match them:
  - **Onboarding advance (always):** `rental_period_start = allot`, `period_end = allot + 6`, `amount = weekly`
  - **Each `C` at position `i`** (before the first `S`): `rental_period_start = allot + 7·(i+1)`, `period_end = +6`, `amount = weekly`

**c) Rent stop / return** — the **first `S`** at position `i` means the rider held
  weeks 1..(i+1) and returned. Rent stops at the start of week `i+2`:
  `rent_stop = allot + 7·(i+1)`. No dues past that.

**d) Dues** (`rent_dues`, the expected weekly ledger) — one row per rental week
  from `allot` up to:
  - `rent_stop` for returned riders, or
  - **today** for active riders (so blank weeks that have already started still count as owed).
  - `amount = daily_rent × 7`, `due_date = period_start − 1` (rent in advance).

---

## 4. Deriving the status of a week (dashboard logic)

In [`lib/rent.ts`](lib/rent.ts), each due week's status is computed live by
matching payments to the week's period:

- `paid ≥ amount` → **Collected**
- `0 < paid < amount` → **Partial**
- `period_start < today` (week already started) & unpaid → **Overdue**
- otherwise → **Pending**

> The week that **starts today** is **Pending, not Overdue** — its collection
> isn't chased yet. This matches the sheet's cutoff (only count weeks that started
> on or before yesterday). The filter is `period_start < today`, **not**
> `due_date < today`.

---

## 5. Sanity checks after a sync

- **Collected total** should equal, over all riders:
  `weekly × (1 + number of C's before the first S)` — the `1` is the prepaid week 1.
- **Gaps** (a `C` in the sheet with no matching payment in the DB) should be **0**.
- **Rate breakdown** should be all `240` or `260` (never `230`).

`sync-full.mjs` prints all three at the end. Run it as a **dry run first**:

```bash
node scripts/sync-full.mjs          # DRY RUN — rolls back, prints the numbers
DRY_RUN=0 node scripts/sync-full.mjs  # APPLY — commits to the DB in .env.local
```

It targets the schema from `.env.local` (`RDS_ENV=uat` → `mg_data_uat`). **Only
run against UAT** unless a prod update is explicitly intended.

---

## 6. Worked reference (as of 2026-07-07, UAT)

73 sheet rows → 72 assignments. After a correct sync:

| Metric | Value |
|--------|-------|
| Collected | ₹4,00,540 (= sheet exactly) |
| Expected-to-date | ₹5,23,320 |
| Pending | ₹1,22,780 |
| Collection % | 77% |
| Payments | 235 (72 onboarding advances + 163 renewals) |
| Gaps vs sheet | 0 |
