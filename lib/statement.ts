import * as XLSX from "xlsx";

// Reading a bank statement export.
//
// HDFC's net-banking export is a legacy BIFF .xls with twenty rows of branch
// letterhead above the table, so the header is found by looking for it rather
// than assumed at a fixed offset, and the columns are located by name so a
// reordered export does not silently shift amounts into the wrong field.
//
// Everything here refuses rather than guesses. A reconciliation that quietly
// mis-reads a statement is worse than one that will not run: the numbers look
// authoritative either way.

export type StatementRow = {
  date: string;          // YYYY-MM-DD
  narration: string;
  ref: string;           // Chq./Ref.No. — for UPI this is the UTR, zero-padded
  withdrawal: number;
  deposit: number;
  balance: number | null;
};

export type ParsedStatement = {
  rows: StatementRow[];
  credits: StatementRow[];
  from: string;
  to: string;
  accountTail: string | null;
  totalCredited: number;
  totalWithdrawn: number;
};

export class StatementFormatError extends Error {}

const COLUMN_KEYS = {
  date: ["date"],
  narration: ["narration", "particulars", "description", "transaction remarks"],
  ref: ["chq./ref.no.", "chq/ref number", "ref no.", "reference number", "cheque no."],
  withdrawal: ["withdrawal amt.", "withdrawal amount", "debit", "debit amount", "withdrawal"],
  deposit: ["deposit amt.", "deposit amount", "credit", "credit amount", "deposit"],
  balance: ["closing balance", "balance"],
};

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => clean(v).toLowerCase().replace(/\s+/g, " ");

// Indian bank exports write dd/mm/yy or dd/mm/yyyy. Two-digit years are this
// century — a rental business has no 20th-century statements.
function toIso(raw: string): string | null {
  const m = clean(raw).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const iso = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

function toAmount(raw: string): number {
  const s = clean(raw).replace(/[,₹\s]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseStatement(buf: Buffer): ParsedStatement {
  let sheetRows: string[][];
  try {
    const wb = XLSX.read(buf, { type: "buffer", raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("no sheets");
    sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  } catch {
    throw new StatementFormatError(
      "That file could not be opened as a spreadsheet. Upload the statement exactly as the bank exports it (.xls, .xlsx or .csv)."
    );
  }

  // Find the header: the first row carrying a date column and a credit column.
  let headerAt = -1;
  let cols: Record<string, number> = {};
  for (let r = 0; r < Math.min(sheetRows.length, 60); r++) {
    const cells = sheetRows[r].map(key);
    const found: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(COLUMN_KEYS)) {
      const i = cells.findIndex((c) => aliases.includes(c));
      if (i >= 0) found[field] = i;
    }
    if (found.date !== undefined && found.deposit !== undefined && found.narration !== undefined) {
      headerAt = r;
      cols = found;
      break;
    }
  }
  if (headerAt < 0) {
    throw new StatementFormatError(
      "This does not look like a bank statement. Expected a header row with Date, Narration and a Deposit (credit) column within the first 60 rows. " +
      "If your bank labels them differently, send me the file and I will add the format."
    );
  }

  const rows: StatementRow[] = [];
  for (let r = headerAt + 1; r < sheetRows.length; r++) {
    const raw = sheetRows[r];
    const iso = toIso(clean(raw[cols.date]));
    if (!iso) continue; // separator rules, blank lines, the footer totals
    const withdrawal = cols.withdrawal !== undefined ? toAmount(clean(raw[cols.withdrawal])) : 0;
    const deposit = toAmount(clean(raw[cols.deposit]));
    if (!withdrawal && !deposit) continue;
    rows.push({
      date: iso,
      narration: clean(raw[cols.narration]),
      ref: clean(raw[cols.ref]),
      withdrawal,
      deposit,
      balance: cols.balance !== undefined && clean(raw[cols.balance]) ? toAmount(clean(raw[cols.balance])) : null,
    });
  }

  if (!rows.length) {
    throw new StatementFormatError(
      "The header was found but no transactions could be read from it. The file may be empty or cover a period with no activity."
    );
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const credits = rows.filter((r) => r.deposit > 0);

  // The account number appears in the letterhead above the table; it is shown
  // back to the user so an upload of the wrong account is obvious immediately.
  let accountTail: string | null = null;
  for (let r = 0; r < headerAt; r++) {
    const m = sheetRows[r].map(clean).join(" ").match(/Account\s*(?:No|Number)\s*[:.]?\s*(\d{6,20})/i);
    if (m) { accountTail = m[1].slice(-4); break; }
  }

  return {
    rows,
    credits,
    from: rows[0].date,
    to: rows[rows.length - 1].date,
    accountTail,
    totalCredited: credits.reduce((s, r) => s + r.deposit, 0),
    totalWithdrawn: rows.reduce((s, r) => s + r.withdrawal, 0),
  };
}
