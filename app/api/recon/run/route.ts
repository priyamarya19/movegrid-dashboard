import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireRecon, reconRecipients } from "@/lib/reconAccess";
import { parseStatement, StatementFormatError } from "@/lib/statement";
import { loadBook, reconcile, toCredits } from "@/lib/reconcile";
import { buildReconWorkbook } from "@/lib/reconWorkbook";
import { putRun, RUN_TTL_MINUTES } from "@/lib/reconCache";

// POST /api/recon/run — reconcile the ops payment book against an uploaded
// bank statement. Admin role AND the Recon grant: the statement carries every
// credit in the account, including investor funding, not just rider money.
//
// Nothing is stored. The result is held in memory for a few minutes so it can
// be downloaded and emailed, and is never written to S3 or the database.

const MAX_BYTES = 10 * 1024 * 1024;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const guard = await requireRecon(req);
  if ("response" in guard) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");

  if (!file) return NextResponse.json({ error: "Attach the bank statement." }, { status: 400 });
  if (!ISO.test(from) || !ISO.test(to)) {
    return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "The start date is after the end date." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.` },
      { status: 413 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let statement;
  try {
    statement = parseStatement(buf);
  } catch (e) {
    if (e instanceof StatementFormatError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }

  const book = await loadBook(from, to);
  if (!book.length) {
    return NextResponse.json(
      { error: `No payments were recorded between ${from} and ${to}, so there is nothing to reconcile.` },
      { status: 422 }
    );
  }

  const result = reconcile(book, toCredits(statement.rows), statement.from, statement.to);

  // Selecting a window the statement does not cover produces a reconciliation
  // that looks authoritative and means nothing, so say so plainly.
  if (to < statement.from || from > statement.to) {
    result.warnings.unshift(
      `The dates you selected (${from} to ${to}) do not overlap the statement at all ` +
      `(${statement.from} to ${statement.to}). Nothing can match.`
    );
  }

  const runBy = guard.session.name || guard.session.email || "an admin";
  const meta = {
    from, to,
    stmtFrom: statement.from, stmtTo: statement.to,
    accountTail: statement.accountTail,
  };
  const workbook = await buildReconWorkbook(result, { ...meta, runBy });
  const filename = `MOVEGRID-Reconciliation-${from}-to-${to}.xlsx`;
  const token = randomUUID();

  putRun({ token, userId: guard.session.userId, runBy, meta, result, workbook, filename });

  // Who the workbook can be sent to: every active admin. Holding the Recon
  // grant governs running a reconciliation, not receiving one.
  const admins = await reconRecipients();

  return NextResponse.json({
    token,
    expiresInMinutes: RUN_TTL_MINUTES,
    filename,
    statement: {
      from: statement.from, to: statement.to,
      accountTail: statement.accountTail,
      credits: statement.credits.length,
      totalCredited: Math.round(statement.totalCredited),
      transactions: statement.rows.length,
    },
    totals: result.totals,
    categories: result.categories,
    warnings: result.warnings,
    outsidePeriod: result.outsidePeriod.length,
    admins,
  });
}
