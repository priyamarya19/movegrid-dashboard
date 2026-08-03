import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { sendEmail } from "@/lib/email";
import { getCallList } from "@/lib/reports";
import { escapeHtml } from "@/lib/html";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const dmy = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

// POST /api/reports/rent-due/send — cron, 9:00 AM IST. The Collections Call
// List: EVERY rider owing (T+1 onwards), worst first — the top of the list is
// the escalation view. Flags tell the caller what NOT to do: a pending payment
// claim means verify instead of calling; a pending waiver is context.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const recipientsRes = await pool.query(
    `SELECT email FROM ${schemas.ops}.report_recipients WHERE report_key = 'rent_due' AND enabled = true`
  );
  const recipients = recipientsRes.rows.map((r) => r.email);
  if (!recipients.length) return NextResponse.json({ sent: false, reason: "no recipients" });

  const [rows, yesterday, claims] = await Promise.all([
    getCallList(),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0)::int AS n FROM ${schemas.ops}.rider_payments
                WHERE payment_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1`),
    pool.query(`SELECT COUNT(*)::int AS n FROM ${schemas.ops}.payment_claims WHERE status = 'pending'`),
  ]);
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  const dayColor = (d: number) => (d >= 15 ? "#d63031" : d > 2 ? "#e17055" : "#fdcb6e");
  const tableRows = rows.map((r) => `
    <tr${r.claim_pending ? ' style="opacity:0.65;"' : ""}>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">
        ${escapeHtml(r.rider_name)} <span style="color:#999;font-size:11px;">${escapeHtml(r.rider_code ?? "")}</span>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.mobile)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.ev_number ?? "-")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${dayColor(r.days_behind)};font-weight:700;">${r.days_behind}d</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${inr(r.outstanding)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${dmy(r.next_due_date)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${r.last_payment_amount != null ? `${inr(r.last_payment_amount)} · ${dmy(r.last_payment_date)}` : "never"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.claim_pending ? "⏳ claim in review — verify, don't call" : r.waiver_pending ? "🏳️ waiver pending" : ""}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;">
      <h2 style="margin:0 0 6px;">Collections Call List — ${stamp}</h2>
      <p style="color:#555;margin:0 0 14px;">
        <b>${inr(totalOutstanding)}</b> outstanding · <b>${rows.length}</b> riders owing ·
        ${inr(Number(yesterday.rows[0].n))} collected yesterday ·
        ⏳ ${Number(claims.rows[0].n)} payment claim(s) awaiting verification
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f5f5f5;text-align:left;">
          <th style="padding:6px 10px;">Rider</th><th style="padding:6px 10px;">Mobile</th>
          <th style="padding:6px 10px;">Vehicle</th><th style="padding:6px 10px;">Behind</th>
          <th style="padding:6px 10px;">Outstanding</th><th style="padding:6px 10px;">Next due</th>
          <th style="padding:6px 10px;">Last payment</th><th style="padding:6px 10px;">Flags</th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#999;">Nobody owes — fully collected 🎉</td></tr>`}</tbody>
      </table>
      <p style="color:#999;font-size:11px;margin-top:12px;">Worst-first: the top rows are your escalation candidates. Riders with recovered vehicles are excluded (see Finance → Bad Debt).</p>
    </div>`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Call List");
  sheet.columns = [
    { header: "Rider", key: "rider_name", width: 22 }, { header: "Code", key: "rider_code", width: 12 },
    { header: "Mobile", key: "mobile", width: 14 }, { header: "Vehicle", key: "ev_number", width: 14 },
    { header: "Hub", key: "hub_name", width: 12 }, { header: "Allotment", key: "allotment_code", width: 12 },
    { header: "Days behind", key: "days_behind", width: 12 }, { header: "Outstanding", key: "outstanding", width: 12 },
    { header: "Next due", key: "next_due_date", width: 12 }, { header: "Daily rate", key: "daily_rent", width: 10 },
    { header: "Credit", key: "rent_credit", width: 10 },
    { header: "Last payment date", key: "last_payment_date", width: 15 },
    { header: "Last payment amt", key: "last_payment_amount", width: 14 },
    { header: "Claim pending", key: "claim_pending", width: 12 }, { header: "Waiver pending", key: "waiver_pending", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await workbook.xlsx.writeBuffer();

  const text = rows.map((r) =>
    `${r.rider_name} (${r.mobile}) — ${r.ev_number ?? "-"} — ${r.days_behind}d behind — ${inr(r.outstanding)}${r.claim_pending ? " [claim in review]" : ""}`
  ).join("\n") || "Nobody owes";

  await sendEmail({
    to: recipients,
    subject: `Call List — ${stamp} · ${inr(totalOutstanding)} from ${rows.length} riders`,
    text,
    html,
    attachments: [{
      filename: `call-list-${stamp}.xlsx`,
      content: Buffer.from(buffer),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });

  return NextResponse.json({ sent: true, recipients: recipients.length, rows: rows.length });
}
