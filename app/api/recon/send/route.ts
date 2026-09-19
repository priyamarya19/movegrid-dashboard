import { NextRequest, NextResponse } from "next/server";
import { requireRecon, reconRecipients } from "@/lib/reconAccess";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { getRun, dropRun } from "@/lib/reconCache";

// POST /api/recon/send — email a finished reconciliation to chosen admins.
//
// Recipients are resolved server-side from user ids against the admin role —
// never taken as addresses from the client — so this endpoint cannot post the
// company's bank statement to an arbitrary inbox. Any active admin may receive
// it, including one who cannot run a reconciliation themselves.

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dmy = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export async function POST(req: NextRequest) {
  const guard = await requireRecon(req);
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.map(String) : [];

  const run = getRun(token, guard.session.userId);
  if (!run) {
    return NextResponse.json(
      { error: "That reconciliation has expired. Run it again — results are kept for a few minutes only." },
      { status: 404 }
    );
  }
  if (!userIds.length) {
    return NextResponse.json({ error: "Choose at least one person to send it to." }, { status: 400 });
  }

  const people = await reconRecipients(userIds);
  if (!people.length) {
    return NextResponse.json(
      { error: "None of those people are active admins with an email address." },
      { status: 400 }
    );
  }

  const t = run.result.totals;
  const m = run.meta;
  const ahead = t.difference >= 0;
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #eee;color:#444;">${escapeHtml(label)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #eee;text-align:right;${strong ? "font-weight:700;" : ""}">${escapeHtml(value)}</td>
    </tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;">
      <h2 style="margin:0 0 4px;">Bank reconciliation</h2>
      <p style="color:#555;margin:0 0 16px;font-size:13px;">
        Account ending ${escapeHtml(m.accountTail ?? "—")} ·
        statement ${escapeHtml(dmy(m.stmtFrom))} to ${escapeHtml(dmy(m.stmtTo))}<br>
        Payments reconciled: ${escapeHtml(dmy(m.from))} to ${escapeHtml(dmy(m.to))} ·
        run by ${escapeHtml(run.runBy)}
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #eee;">
        ${row("Rider money received in the bank", inr(t.riderTypeBank))}
        ${row("Recorded in the ops book", inr(t.bookAmount))}
        ${row(ahead ? "Bank ahead of the book by" : "Book ahead of the bank by", inr(Math.abs(t.difference)), true)}
      </table>
      <p style="color:#555;font-size:13px;margin:16px 0 6px;">
        <b>${t.matchedCount}</b> entries matched (${t.byUtr} by exact UTR, ${t.byName} by payer name,
        ${t.byAmountDate} on amount and date alone)${t.bySplit ? `, including ${t.bySplit} paid in instalments` : ""}.
        <b>${t.unmatchedCount}</b> ops entries and <b>${t.unmatchedCreditCount}</b> bank credits are unmatched.
      </p>
      ${run.result.warnings.length ? `
      <div style="background:#fcf2df;border-left:3px solid #e3a33c;padding:10px 12px;font-size:12.5px;color:#444;margin:12px 0;">
        ${run.result.warnings.map((w) => escapeHtml(w)).join("<br>")}
      </div>` : ""}
      <p style="color:#888;font-size:11.5px;margin-top:14px;line-height:1.5;">
        Line-by-line matching cannot close this book completely, and that is expected: riders pay a week's
        rent in instalments while ops record one completed week, so one entry often corresponds to several
        credits. Where two credits fitted equally well, no match was made. Judge it on the bottom line above,
        not the matched count. Full detail is in the attached workbook.
      </p>
    </div>`;

  const text = [
    `Bank reconciliation — account ending ${m.accountTail ?? "—"}`,
    `Statement ${m.stmtFrom} to ${m.stmtTo}; payments ${m.from} to ${m.to}`,
    ``,
    `Rider money in the bank : ${inr(t.riderTypeBank)}`,
    `Recorded in the ops book: ${inr(t.bookAmount)}`,
    `${ahead ? "Bank ahead by" : "Book ahead by"}          : ${inr(Math.abs(t.difference))}`,
    ``,
    `${t.matchedCount} matched, ${t.unmatchedCount} ops entries and ${t.unmatchedCreditCount} credits unmatched.`,
  ].join("\n");

  await sendEmail({
    to: people.map((p) => p.email),
    subject: `Bank reconciliation ${dmy(m.from)} – ${dmy(m.to)} · ${ahead ? "bank ahead" : "book ahead"} ${inr(Math.abs(t.difference))}`,
    text,
    html,
    attachments: [{
      filename: run.filename,
      content: run.workbook,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });

  // Sent is the end of the run's life — nothing about it is kept.
  dropRun(token);

  return NextResponse.json({ sent: true, recipients: people.map((p) => p.name || p.email) });
}
