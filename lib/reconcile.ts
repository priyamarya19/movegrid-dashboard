import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import type { StatementRow } from "@/lib/statement";

// Matching the ops payment book against a bank statement.
//
// Three passes, in descending order of certainty:
//   1. UTR. The bank prints it in Chq./Ref.No., zero-padded, and again inside
//      the narration. An exact hit needs no judgement at all.
//   2. Payer name + amount + date. The narration carries who sent the money,
//      which is what separates five riders paying ₹1,680 on the same Tuesday.
//      Scored across the whole book and assigned best-first, because deciding
//      each record alone cannot resolve a set that is obvious as a set.
//   3. Instalments. One recorded week can be several credits: riders pay ₹1,000
//      today and ₹680 on Friday, and ops enter one completed week.
//
// What it deliberately will NOT do is force a match. Where two credits fit
// equally well the entry is left unmatched and labelled ambiguous. A wrong name
// against a rupee figure is worse than an honest gap, and this output is used
// to decide whether to chase a rider.

export const TOLERANCE_DAYS = 3;
const SPLIT_BACK_DAYS = 12;
const SPLIT_FWD_DAYS = 2;
const RIDER_SIZED_MIN = 300;
const RIDER_SIZED_MAX = 8000;

export type Credit = {
  date: string; amount: number; narration: string; ref: string;
  payer: string; utrs: string[]; used: BookEntry | null; category?: string;
};

export type BookEntry = {
  kind: "rent" | "penalty";
  id: string; name: string; code: string | null; ev: string | null;
  rec_date: string; amount: number; mode: string; has_proof: boolean;
  utr: string; utr_src: string;
  proof_date: string; proof_time: string; match_date: string;
  detail: string;
  match?: Credit; method?: string; confidence?: string;
  matched_payer?: string; date_gap?: number; amt_gap?: number;
  split?: string; ambiguous?: number;
};

export type ReconResult = {
  matched: BookEntry[];
  unmatched: BookEntry[];
  outsidePeriod: BookEntry[];
  unmatchedCredits: Credit[];
  totals: {
    bookEntries: number; bookAmount: number;
    creditCount: number; creditAmount: number;
    matchedCount: number; matchedAmount: number;
    byUtr: number; byName: number; byAmountDate: number; bySplit: number;
    riderTypeBank: number; difference: number;
    unmatchedCount: number; unmatchedAmount: number;
    unmatchedCreditCount: number; unmatchedCreditAmount: number;
  };
  categories: { category: string; count: number; amount: number }[];
  warnings: string[];
};

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

const stripLeadingZeros = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

// The bank's reference column is the UTR with leading zeros; the narration
// repeats it, which is the fallback when the column is blank.
function creditUtrs(r: StatementRow): string[] {
  const out = new Set<string>();
  const ref = stripLeadingZeros(r.ref);
  if (ref.length >= 9) out.add(ref);
  for (const m of r.narration.matchAll(/(?<!\d)(\d{9,18})(?!\d)/g)) {
    const v = m[1].replace(/^0+/, "");
    if (v.length >= 9) out.add(v);
  }
  return [...out];
}

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((w) => w.length > 2);

// Surnames half the hub shares carry almost no information; a distinctive given
// name carries a lot. Scoring this way stops "Kumar" from deciding a match.
const COMMON = new Set(["KUMAR", "SINGH", "YADAV", "PRASAD", "SHARMA", "RAM", "LAL", "DEVI"]);

export function nameScore(riderName: string, payerName: string): number {
  const a = tokens(riderName), b = tokens(payerName);
  if (!a.length || !b.length) return 0;
  if (norm(riderName) === norm(payerName)) return 3;
  const shared = a.filter((w) => b.includes(w));
  if (shared.length >= 2) return 3;
  if (shared.length === 1) return COMMON.has(shared[0]) ? 1 : 2;
  return 0;
}

export function toCredits(rows: StatementRow[]): Credit[] {
  return rows.filter((r) => r.deposit > 0).map((r) => ({
    date: r.date,
    amount: Math.round(r.deposit),
    narration: r.narration,
    ref: r.ref,
    payer: (r.narration.match(/^UPI-([^-]+)/) || [, ""])[1]!.replace(/\s+/g, " ").trim(),
    utrs: creditUtrs(r),
    used: null,
  }));
}

/** The ops payment book — rent receipts and recovered penalties — for a window. */
export async function loadBook(from: string, to: string): Promise<BookEntry[]> {
  const S = schemas.ops;
  const [pay, pen] = await Promise.all([
    pool.query(
      `SELECT p.id, ri.name, ri.rider_code, v.ev_number,
              to_char(p.payment_date,'YYYY-MM-DD') AS pay_date,
              p.amount_collected::int AS amt,
              COALESCE(p.payment_mode,'') AS mode,
              COALESCE(p.payment_utr,'') AS db_utr,
              (p.payment_screenshot_url IS NOT NULL) AS has_proof
         FROM ${S}.rider_payments p
         JOIN ${S}.riders ri ON ri.id = p.rider_id
         LEFT JOIN ${S}.vehicles v ON v.id = p.vehicle_id
        WHERE p.payment_date BETWEEN $1::date AND $2::date
        ORDER BY p.payment_date, ri.name`, [from, to]),
    pool.query(
      `SELECT x.id, ri.name, x.amount::int AS amt, x.detail,
              to_char(x.paid_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS paid_date,
              COALESCE(x.payment_utr,'') AS db_utr, COALESCE(x.payment_mode,'') AS mode
         FROM ${S}.rider_penalties x
         JOIN ${S}.riders ri ON ri.id = x.rider_id
        WHERE x.status = 'paid'
          AND (x.paid_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        ORDER BY x.paid_at`, [from, to]),
  ]);

  return [
    ...pay.rows.map((p): BookEntry => ({
      kind: "rent", id: p.id, name: p.name, code: p.rider_code, ev: p.ev_number,
      rec_date: p.pay_date, amount: p.amt, mode: p.mode, has_proof: p.has_proof,
      utr: stripLeadingZeros(p.db_utr), utr_src: p.db_utr ? "on file" : "",
      proof_date: "", proof_time: "", match_date: p.pay_date, detail: "",
    })),
    ...pen.rows.map((p): BookEntry => ({
      kind: "penalty", id: p.id, name: p.name, code: null, ev: null,
      rec_date: p.paid_date, amount: p.amt, mode: p.mode, has_proof: false,
      utr: stripLeadingZeros(p.db_utr), utr_src: p.db_utr ? "on file" : "",
      proof_date: "", proof_time: "", match_date: p.paid_date, detail: p.detail ?? "",
    })),
  ];
}

export function reconcile(
  book: BookEntry[], credits: Credit[], stmtFrom: string, stmtTo: string
): ReconResult {
  const warnings: string[] = [];

  const byUtr = new Map<string, Credit[]>();
  for (const c of credits) {
    for (const u of c.utrs) {
      if (!byUtr.has(u)) byUtr.set(u, []);
      byUtr.get(u)!.push(c);
    }
  }

  // ── 1. UTR ─────────────────────────────────────────────────────────────
  for (const o of book) {
    if (!o.utr) continue;
    const hits = (byUtr.get(o.utr) ?? []).filter((c) => !c.used);
    if (hits.length !== 1) continue;
    const c = hits[0];
    c.used = o;
    o.match = c; o.method = "UTR"; o.confidence = "exact";
    o.matched_payer = c.payer;
    o.amt_gap = c.amount - o.amount;
    o.date_gap = dayDiff(c.date, o.match_date);
  }

  // Two different questions, and conflating them loses real matches.
  //
  // For REPORTING, "outside the period" means strictly outside the statement —
  // that is what the user needs told.
  //
  // For MATCHING, the window has to be wider. Ops enter a payment when the week
  // completes, which is often days after the money actually arrived, so a
  // receipt dated the 16th can legitimately be made up of credits from the 10th
  // and the 14th. Judging eligibility on the strict period threw those away.
  const inPeriod = (o: BookEntry) => o.rec_date >= stmtFrom && o.rec_date <= stmtTo;
  const eligible = (o: BookEntry) =>
    dayDiff(o.rec_date, stmtFrom) >= -SPLIT_FWD_DAYS &&
    dayDiff(o.rec_date, stmtTo) <= SPLIT_BACK_DAYS;

  // ── 2. name + amount + date, assigned globally, best first ─────────────
  const pending = book.filter((o) => !o.match && eligible(o));
  type Pair = { o: BookEntry; c: Credit; name: number; gap: number; score: number };
  const pairs: Pair[] = [];
  for (const o of pending) {
    for (const c of credits) {
      if (c.used || c.amount !== o.amount) continue;
      const gap = Math.abs(dayDiff(c.date, o.match_date));
      if (gap > TOLERANCE_DAYS) continue;
      const name = nameScore(o.name, c.payer);
      pairs.push({ o, c, name, gap, score: name * 100 + (TOLERANCE_DAYS - gap) * 10 });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const candidates = new Map<BookEntry, number>();
  for (const p of pairs) candidates.set(p.o, (candidates.get(p.o) ?? 0) + 1);

  for (const p of pairs) {
    if (p.o.match || p.c.used) continue;
    // With no name agreement at all there is nothing tying this credit to this
    // rider beyond a figure and a date, so it is only taken when it is the sole
    // possibility on BOTH sides. Two riders paying ₹1,680 on the same Tuesday
    // against two anonymous credits is a coin toss, and a coin toss recorded as
    // a match is what sends someone to chase the wrong rider.
    if (p.name === 0) {
      const better = pairs.some((q) => q !== p && q.name > 0 &&
        ((q.o === p.o && !q.c.used) || (q.c === p.c && !q.o.match)));
      if (better) continue;
      const tied = pairs.some((q) => q !== p && q.score === p.score &&
        ((q.o === p.o && !q.c.used) || (q.c === p.c && !q.o.match)));
      if (tied) continue;
    }
    p.c.used = p.o;
    p.o.match = p.c;
    p.o.matched_payer = p.c.payer;
    p.o.amt_gap = 0;
    p.o.date_gap = dayDiff(p.c.date, p.o.match_date);
    p.o.method = p.name >= 2 ? `name + amount${p.gap ? ` (${p.gap}d)` : ""}`
      : p.name === 1 ? `part name + amount${p.gap ? ` (${p.gap}d)` : ""}`
      : `amount + date${p.gap ? ` (${p.gap}d)` : " (same day)"}`;
    p.o.confidence = p.name >= 2 ? "high" : p.name === 1 ? "medium" : "low — amount and date only";
  }
  for (const o of pending) {
    if (!o.match && candidates.get(o)) o.ambiguous = candidates.get(o);
  }

  // ── 3. instalments ─────────────────────────────────────────────────────
  for (const o of book) {
    if (o.match || !eligible(o)) continue;
    const pool_ = credits.filter((c) => !c.used &&
      dayDiff(c.date, o.match_date) <= SPLIT_FWD_DAYS &&
      dayDiff(c.date, o.match_date) >= -SPLIT_BACK_DAYS &&
      c.amount < o.amount && nameScore(o.name, c.payer) >= 2);
    if (pool_.length < 2) continue;

    let found: Credit[] | null = null;
    for (let i = 0; i < pool_.length && !found; i++) {
      for (let j = i + 1; j < pool_.length && !found; j++) {
        if (pool_[i].amount + pool_[j].amount === o.amount) { found = [pool_[i], pool_[j]]; break; }
        for (let k = j + 1; k < pool_.length && !found; k++) {
          if (pool_[i].amount + pool_[j].amount + pool_[k].amount === o.amount) {
            found = [pool_[i], pool_[j], pool_[k]];
          }
        }
      }
    }
    if (!found) continue;
    found.forEach((c) => { c.used = o; });
    o.match = found[0];
    o.split = found.map((c) => `${c.date} ₹${c.amount}`).join(" + ");
    o.matched_payer = found[0].payer;
    o.method = `paid in ${found.length} parts`;
    o.confidence = "high";
    o.amt_gap = 0;
    o.date_gap = dayDiff(found[found.length - 1].date, o.match_date);
    delete o.ambiguous;
  }

  const matched = book.filter((o) => o.match);
  const outsidePeriod = book.filter((o) => !o.match && !inPeriod(o));
  const unmatched = book.filter((o) => !o.match && inPeriod(o));
  const unmatchedCredits = credits.filter((c) => !c.used);

  const riderNameTokens = new Set<string>();
  book.forEach((o) => tokens(o.name).forEach((t) => riderNameTokens.add(t)));
  for (const c of unmatchedCredits) {
    c.category = /SETTLEMENT/i.test(c.narration) ? "Merchant settlement (bulk)"
      : c.amount >= 20000 ? "Large credit — funding, not rent"
      : /CHQ DEP|CLG/i.test(c.narration) ? "Cheque deposit"
      : tokens(c.payer).some((w) => riderNameTokens.has(w)) ? "Payer name matches a rider"
      : "Unidentified payer";
  }
  const catMap = new Map<string, { count: number; amount: number }>();
  for (const c of unmatchedCredits) {
    const e = catMap.get(c.category!) ?? { count: 0, amount: 0 };
    e.count++; e.amount += c.amount;
    catMap.set(c.category!, e);
  }

  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);
  const riderSizedUnmatched = unmatchedCredits
    .filter((c) => c.amount >= RIDER_SIZED_MIN && c.amount <= RIDER_SIZED_MAX);
  const riderTypeBank = sum(matched.map((m) => m.match!)) + sum(riderSizedUnmatched);
  const inPeriodBook = matched.concat(unmatched);

  if (outsidePeriod.length) {
    warnings.push(
      `${outsidePeriod.length} payment${outsidePeriod.length === 1 ? "" : "s"} in the selected range ` +
      `fall outside the statement's own period (${stmtFrom} to ${stmtTo}) and cannot be matched. ` +
      `They are listed separately.`
    );
  }
  const lowConf = matched.filter((m) => m.confidence?.startsWith("low")).length;
  if (lowConf) {
    warnings.push(`${lowConf} matches rest on amount and date alone — worth a spot-check.`);
  }

  return {
    matched, unmatched, outsidePeriod, unmatchedCredits,
    totals: {
      bookEntries: inPeriodBook.length,
      bookAmount: sum(inPeriodBook),
      creditCount: credits.length,
      creditAmount: sum(credits),
      matchedCount: matched.length,
      matchedAmount: sum(matched),
      byUtr: matched.filter((m) => m.method === "UTR").length,
      byName: matched.filter((m) => /name/.test(m.method ?? "")).length,
      byAmountDate: matched.filter((m) => /^amount/.test(m.method ?? "")).length,
      bySplit: matched.filter((m) => m.split).length,
      riderTypeBank,
      difference: riderTypeBank - sum(inPeriodBook),
      unmatchedCount: unmatched.length,
      unmatchedAmount: sum(unmatched),
      unmatchedCreditCount: unmatchedCredits.length,
      unmatchedCreditAmount: sum(unmatchedCredits),
    },
    categories: [...catMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.amount - a.amount),
    warnings,
  };
}
