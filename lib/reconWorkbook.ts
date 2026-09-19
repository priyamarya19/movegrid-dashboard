import ExcelJS from "exceljs";
import type { ReconResult, BookEntry, Credit } from "@/lib/reconcile";

// The reconciliation workbook. Seven sheets, summary first, because the person
// opening this wants the bottom line before the evidence.

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFECFE" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCF2DF" } };
const MONEY = '"₹"#,##0';

type Col<T> = { h: string; w: number; v: (r: T) => string | number; money?: boolean };

function addSheet<T>(wb: ExcelJS.Workbook, name: string, cols: Col<T>[], data: T[], note: string) {
  const ws = wb.addWorksheet(name);
  const n = ws.addRow([note]);
  n.font = { size: 9, color: { argb: "FF555555" } };
  n.alignment = { wrapText: false };
  ws.mergeCells(1, 1, 1, cols.length);
  ws.addRow([]);
  const head = ws.addRow(cols.map((c) => c.h));
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = HEAD_FILL; c.border = { bottom: { style: "thin" } }; });
  ws.columns.forEach((c, i) => { c.width = cols[i].w; });
  for (const r of data) {
    const row = ws.addRow(cols.map((c) => c.v(r)));
    cols.forEach((c, i) => { if (c.money) row.getCell(i + 1).numFmt = MONEY; });
  }
  ws.views = [{ state: "frozen", ySplit: head.number }];
  ws.autoFilter = {
    from: { row: head.number, column: 1 },
    to: { row: head.number + data.length, column: cols.length },
  };
  return ws;
}

export function buildReconWorkbook(
  r: ReconResult,
  meta: { from: string; to: string; stmtFrom: string; stmtTo: string; accountTail: string | null; runBy: string }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MOVEGRID";
  wb.created = new Date();

  const t = r.totals;
  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 46 }, { width: 16 }, { width: 62 }];
  const put = (a: string, b: string | number, c: string, bold = false) => {
    const row = s.addRow([a, b, c]);
    if (bold) row.font = { bold: true };
    if (typeof b === "number") row.getCell(2).numFmt = MONEY;
    return row;
  };

  put("MOVEGRID — bank reconciliation", "", `Account ending ${meta.accountTail ?? "—"}. Run by ${meta.runBy}.`, true);
  s.addRow([]);
  put("Payments selected", "", `${meta.from} to ${meta.to}`);
  put("Statement covers", "", `${meta.stmtFrom} to ${meta.stmtTo}`);
  s.addRow([]);
  put("BOTTOM LINE", "", "", true);
  put("Rider money received in the bank", t.riderTypeBank, "matched credits plus every unmatched credit of rider size (₹300–₹8,000)");
  put("Recorded in the ops book", t.bookAmount, `${t.bookEntries} entries — rent and recovered penalties`);
  const diffRow = put(t.difference >= 0 ? "Bank ahead of the book by" : "Book ahead of the bank by",
    Math.abs(t.difference),
    t.difference >= 0
      ? "money that arrived and was never entered against a rider — investigate"
      : "recorded more than the account received — investigate", true);
  diffRow.eachCell((c) => { c.fill = TOTAL_FILL; });
  s.addRow([]);
  put("MATCHED", t.matchedAmount, `${t.matchedCount} entries tied to a specific credit`, true);
  put("   by UTR — exact", t.byUtr, "the bank prints the UTR, so no judgement is involved");
  put("   by payer name + amount", t.byName, "high confidence");
  put("   by amount and date only", t.byAmountDate, "LOW confidence — spot-check these");
  put("   paid in instalments", t.bySplit, "one recorded week made up of several credits");
  s.addRow([]);
  put("NOT MATCHED — ops book", t.unmatchedAmount, `${t.unmatchedCount} entries with no credit assigned`, true);
  put("NOT MATCHED — bank credits", t.unmatchedCreditAmount, `${t.unmatchedCreditCount} credits with no entry assigned`, true);
  for (const c of r.categories) put(`   ${c.category}`, c.amount, `${c.count} credits`);
  if (r.outsidePeriod.length) {
    s.addRow([]);
    put("OUTSIDE THE STATEMENT PERIOD", r.outsidePeriod.reduce((a, b) => a + b.amount, 0),
      `${r.outsidePeriod.length} payments dated outside ${meta.stmtFrom}–${meta.stmtTo}. They cannot appear on this statement.`, true);
  }
  s.addRow([]);
  put("HOW TO READ THIS", "", "", true);
  put("", "", "Line-by-line matching cannot close this book completely, and that is expected rather than a fault. Riders pay a week's rent in instalments while ops record one completed week, so a single entry often corresponds to several credits. Where two credits fitted an entry equally well, no match was made — an honest gap is better than a wrong name against a rupee figure. Judge the reconciliation on the bottom line above, not on the matched count.");
  s.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  if (r.warnings.length) {
    s.addRow([]);
    put("WARNINGS", "", "", true);
    r.warnings.forEach((w) => put("", "", w));
  }

  const money = (n: number | undefined) => n ?? 0;

  addSheet<BookEntry>(wb, "Matched", [
    { h: "Rider", w: 24, v: (x) => x.name },
    { h: "Type", w: 9, v: (x) => x.kind },
    { h: "Recorded date", w: 14, v: (x) => x.rec_date },
    { h: "Amount", w: 12, v: (x) => x.amount, money: true },
    { h: "Bank date", w: 12, v: (x) => x.match?.date ?? "" },
    { h: "Bank amount", w: 13, v: (x) => money(x.match?.amount), money: true },
    { h: "Bank ref (UTR)", w: 20, v: (x) => x.match?.ref ?? "" },
    { h: "Payer on statement", w: 26, v: (x) => x.matched_payer ?? "" },
    { h: "Matched how", w: 24, v: (x) => x.method ?? "" },
    { h: "Confidence", w: 26, v: (x) => x.confidence ?? "" },
    { h: "Days apart", w: 11, v: (x) => x.date_gap ?? 0 },
    { h: "Paid in parts", w: 34, v: (x) => x.split ?? "" },
    { h: "Narration", w: 62, v: (x) => x.match?.narration ?? "" },
  ], r.matched, "Every ops entry tied to a specific credit. UTR matches are exact; rows marked low confidence rest on amount and date alone.");

  addSheet<BookEntry>(wb, "Unmatched — book", [
    { h: "Rider", w: 24, v: (x) => x.name },
    { h: "Type", w: 9, v: (x) => x.kind },
    { h: "Recorded date", w: 14, v: (x) => x.rec_date },
    { h: "Amount", w: 12, v: (x) => x.amount, money: true },
    { h: "Mode", w: 14, v: (x) => x.mode },
    { h: "Proof on file", w: 13, v: (x) => (x.has_proof ? "yes" : "") },
    { h: "UTR on file", w: 20, v: (x) => x.utr },
    { h: "Credits that could fit", w: 21, v: (x) => x.ambiguous ?? "" },
    { h: "Note", w: 40, v: (x) => x.detail },
  ], r.unmatched, "Recorded, but no bank credit could be tied to it. 'Credits that could fit' means more than one candidate matched equally well, so none was chosen.");

  addSheet<Credit>(wb, "Unmatched — bank", [
    { h: "Date", w: 12, v: (x) => x.date },
    { h: "Amount", w: 13, v: (x) => x.amount, money: true },
    { h: "Payer", w: 28, v: (x) => x.payer },
    { h: "Category", w: 32, v: (x) => x.category ?? "" },
    { h: "Bank ref (UTR)", w: 20, v: (x) => x.ref },
    { h: "Narration", w: 78, v: (x) => x.narration },
  ], r.unmatchedCredits.slice().sort((a, b) => b.amount - a.amount),
    "Money that arrived with no ops entry against it. Large credits are funding, not rent. 'Payer name matches a rider' is the bucket that matters.");

  // Per rider — the view that actually reconciles, since it does not depend on
  // pairing a weekly lump to individual instalments.
  type RiderRow = { name: string; code: string; n: number; recorded: number; bn: number; bank: number; diff: number };
  const riders = new Map<string, RiderRow>();
  for (const o of r.matched.concat(r.unmatched)) {
    const e = riders.get(o.name) ?? { name: o.name, code: o.code ?? "", n: 0, recorded: 0, bn: 0, bank: 0, diff: 0 };
    e.n++; e.recorded += o.amount;
    riders.set(o.name, e);
  }
  for (const o of r.matched) {
    const e = riders.get(o.name)!;
    e.bank += o.match!.amount; e.bn++;
  }
  const COMMON = new Set(["KUMAR", "SINGH", "YADAV", "PRASAD", "SHARMA", "RAM", "LAL", "DEVI"]);
  const tk = (v: string) => v.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !COMMON.has(w));
  for (const c of r.unmatchedCredits) {
    const pt = tk(c.payer);
    if (!pt.length) continue;
    for (const e of riders.values()) {
      if (tk(e.name).some((w) => pt.includes(w))) { e.bank += c.amount; e.bn++; break; }
    }
  }
  const riderRows = [...riders.values()].map((x) => ({ ...x, diff: x.bank - x.recorded }))
    .sort((a, b) => a.diff - b.diff);

  addSheet<RiderRow>(wb, "Per rider", [
    { h: "Rider", w: 26, v: (x) => x.name },
    { h: "Code", w: 12, v: (x) => x.code },
    { h: "Entries recorded", w: 16, v: (x) => x.n },
    { h: "Recorded total", w: 16, v: (x) => x.recorded, money: true },
    { h: "Credits in bank", w: 15, v: (x) => x.bn },
    { h: "Bank total", w: 14, v: (x) => x.bank, money: true },
    { h: "Difference", w: 14, v: (x) => x.diff, money: true },
  ], riderRows,
    "TREAT THE DIFFERENCE AS A POINTER, NOT A VERDICT: a rider paying from a spouse's or brother's account is credited to nobody here, which shows as a shortfall against them and a surplus nowhere. Use it to choose who to look at first.");

  if (r.outsidePeriod.length) {
    addSheet<BookEntry>(wb, "Outside statement period", [
      { h: "Rider", w: 24, v: (x) => x.name },
      { h: "Recorded date", w: 14, v: (x) => x.rec_date },
      { h: "Amount", w: 12, v: (x) => x.amount, money: true },
      { h: "Mode", w: 14, v: (x) => x.mode },
    ], r.outsidePeriod,
      `Dated outside ${meta.stmtFrom}–${meta.stmtTo}, so this statement cannot contain them.`);
  }

  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}
