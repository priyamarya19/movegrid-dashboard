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

  const [rows, yesterday, claims, expenalty] = await Promise.all([
    getCallList(),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0)::int AS n FROM ${schemas.ops}.rider_payments
                WHERE payment_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1`),
    pool.query(`SELECT COUNT(*)::int AS n FROM ${schemas.ops}.payment_claims WHERE status = 'pending'`),
    // Penalties owed by riders who no longer hold a scooter. They cannot appear
    // in the call list — there is no active assignment to hang them on — but the
    // money is real and was invisible everywhere, so it gets a line of its own.
    pool.query(`
      SELECT COALESCE(SUM(x.amount),0)::int AS total, COUNT(*)::int AS n
      FROM ${schemas.ops}.rider_penalties x
      WHERE x.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments a
                        WHERE a.rider_id = x.rider_id AND a.status = 'active')`),
  ]);
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalPenalty = rows.reduce((s, r) => s + r.penalty_pending, 0);
  const withPenalty = rows.filter((r) => r.penalty_pending > 0).length;

  const dayColor = (d: number) => (d >= 15 ? "#d63031" : d > 2 ? "#e17055" : "#fdcb6e");
  const tableRows = rows.map((r) => `
    <tr${r.claim_pending ? ' style="opacity:0.65;"' : ""}>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">
        ${escapeHtml(r.rider_name)} <span style="color:#999;font-size:11px;">${escapeHtml(r.rider_code ?? "")}</span>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.mobile)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.ev_number ?? "-")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${dayColor(r.days_behind)};font-weight:700;">${r.days_behind > 0 ? `${r.days_behind}d` : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${r.outstanding > 0 ? inr(r.outstanding) : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:${r.penalty_pending > 0 ? "#6c5ce7" : "#bbb"};">${
        r.penalty_pending > 0
          ? `${inr(r.penalty_pending)}<span style="color:#999;font-weight:400;font-size:11px;"> · ${r.penalty_count}${r.penalty_oldest_days != null ? ` · ${r.penalty_oldest_days}d old` : ""}</span>`
          : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${dmy(r.next_due_date)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;">${r.last_payment_amount != null ? `${inr(r.last_payment_amount)} · ${dmy(r.last_payment_date)}` : "never"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.claim_pending ? "⏳ claim in review — verify, don't call" : r.waiver_pending ? "🏳️ waiver pending" : r.outstanding === 0 && r.penalty_pending > 0 ? "⚠️ penalty only — rent is current" : ""}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;">
      <h2 style="margin:0 0 6px;">Collections Call List — ${stamp}</h2>
      <p style="color:#555;margin:0 0 14px;">
        <b>${inr(totalOutstanding)}</b> outstanding · <b>${rows.length}</b> riders owing ·
        ${inr(Number(yesterday.rows[0].n))} collected yesterday ·
        ⏳ ${Number(claims.rows[0].n)} payment claim(s) awaiting verification
        ${totalPenalty > 0 ? `<br><b style="color:#6c5ce7;">${inr(totalPenalty)}</b> in unpaid penalties across ${withPenalty} of these riders` : ""}
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f5f5f5;text-align:left;">
          <th style="padding:6px 10px;">Rider</th><th style="padding:6px 10px;">Mobile</th>
          <th style="padding:6px 10px;">Vehicle</th><th style="padding:6px 10px;">Behind</th>
          <th style="padding:6px 10px;">Outstanding</th><th style="padding:6px 10px;">Penalty</th>
          <th style="padding:6px 10px;">Next due</th>
          <th style="padding:6px 10px;">Last payment</th><th style="padding:6px 10px;">Flags</th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="9" style="padding:16px;text-align:center;color:#999;">Nobody owes — fully collected 🎉</td></tr>`}</tbody>
      </table>
      ${Number(expenalty.rows[0].total) > 0 ? `
      <p style="margin:14px 0 0;padding:10px 12px;background:#f7f5ff;border-left:3px solid #6c5ce7;font-size:12px;color:#444;">
        <b>${inr(Number(expenalty.rows[0].total))}</b> in penalties is owed by <b>${Number(expenalty.rows[0].n)}</b> riders who no longer hold a scooter.
        They are not callable from this list — recovery is a separate conversation.
      </p>` : ""}
      <p style="color:#999;font-size:11px;margin-top:12px;">Worst-first: the top rows are your escalation candidates. Riders with recovered vehicles are excluded (see Finance → Bad Debt). A rider shown with no days behind is on the list for an unpaid penalty only.</p>
    </div>`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Call List");
  sheet.columns = [
    { header: "Rider", key: "rider_name", width: 22 }, { header: "Code", key: "rider_code", width: 12 },
    { header: "Mobile", key: "mobile", width: 14 }, { header: "Vehicle", key: "ev_number", width: 14 },
    { header: "Hub", key: "hub_name", width: 12 }, { header: "Allotment", key: "allotment_code", width: 12 },
    { header: "Days behind", key: "days_behind", width: 12 }, { header: "Outstanding", key: "outstanding", width: 12 },
    { header: "Penalty pending", key: "penalty_pending", width: 15 },
    { header: "Penalties", key: "penalty_count", width: 10 },
    { header: "Oldest penalty (days)", key: "penalty_oldest_days", width: 20 },
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
    `${r.rider_name} (${r.mobile}) — ${r.ev_number ?? "-"} — ${r.days_behind > 0 ? `${r.days_behind}d behind — ${inr(r.outstanding)}` : "rent current"}${r.penalty_pending > 0 ? ` — penalty ${inr(r.penalty_pending)}` : ""}${r.claim_pending ? " [claim in review]" : ""}`
  ).join("\n") || "Nobody owes";

  await sendEmail({
    to: recipients,
    subject: `Call List — ${stamp} · ${inr(totalOutstanding)} from ${rows.length} riders${totalPenalty > 0 ? ` · ${inr(totalPenalty)} penalties` : ""}`,
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
