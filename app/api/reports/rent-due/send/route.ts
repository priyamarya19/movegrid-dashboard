import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { sendEmail } from "@/lib/email";
import { getRentDueAlert } from "@/lib/reports";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// POST /api/reports/rent-due/send — cron-triggered (9:00 AM IST). Emails riders whose
// rent is due today/tomorrow, plus already-overdue riders, to enabled recipients.
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

  const rows = await getRentDueAlert();
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const labelColor: Record<string, string> = { Overdue: "#e17055", Today: "#fdcb6e", Tomorrow: "#00C48C" };
  const tableRows = rows.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.rider_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.mobile}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.ev_number ?? "-"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.hub_name ?? "-"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${inr(r.amount_due)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${labelColor[r.due_label]};font-weight:600;">${r.due_label}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;">
      <h2 style="margin:0 0 12px;">Rent Due — ${stamp}</h2>
      <p style="color:#555;margin:0 0 16px;">${rows.length} rider(s) due today, tomorrow, or already overdue.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;">
            <th style="padding:6px 10px;">Rider</th>
            <th style="padding:6px 10px;">Mobile</th>
            <th style="padding:6px 10px;">Vehicle No</th>
            <th style="padding:6px 10px;">Hub</th>
            <th style="padding:6px 10px;">Amount Due</th>
            <th style="padding:6px 10px;">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="6" style="padding:16px;text-align:center;color:#999;">Nothing due</td></tr>`}</tbody>
      </table>
    </div>`;

  const text = rows.map((r) => `${r.rider_name} (${r.mobile}) — ${r.ev_number ?? "-"} — ${inr(r.amount_due)} — ${r.due_label}`).join("\n") || "Nothing due";

  await sendEmail({
    to: recipients,
    subject: `Rent Due Alert — ${stamp} (${rows.length})`,
    text,
    html,
  });

  return NextResponse.json({ sent: true, recipients: recipients.length, rows: rows.length });
}
