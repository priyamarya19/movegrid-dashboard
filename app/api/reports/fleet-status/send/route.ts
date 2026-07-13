import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { sendEmail } from "@/lib/email";
import { getFleetRentStatusReport } from "@/lib/reports";

// POST /api/reports/fleet-status/send — cron-triggered (6:30 PM IST). Builds the
// fleet & rider rent status Excel and emails it to enabled recipients.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const recipientsRes = await pool.query(
    `SELECT email FROM ${schemas.ops}.report_recipients WHERE report_key = 'fleet_status' AND enabled = true`
  );
  const recipients = recipientsRes.rows.map((r) => r.email);
  if (!recipients.length) return NextResponse.json({ sent: false, reason: "no recipients" });

  const rows = await getFleetRentStatusReport();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Fleet & Rider Rent Status");
  sheet.columns = [
    { header: "Vehicle No", key: "ev_number", width: 18 },
    { header: "Hub", key: "hub_name", width: 18 },
    { header: "Rider", key: "rider_name", width: 20 },
    { header: "Mobile", key: "mobile", width: 14 },
    { header: "Onboarding Fee", key: "onboarding_fee", width: 16 },
    { header: "Security Deposit", key: "security_deposit", width: 16 },
    { header: "Total Paid Till Date", key: "total_paid", width: 18 },
    { header: "Weekly Rent", key: "weekly_rent", width: 14 },
    { header: "Next Due Date", key: "next_due_date", width: 16 },
    { header: "Pending Amount", key: "pending_amount", width: 16 },
    { header: "Overdue Amount", key: "overdue_amount", width: 16 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  // ── Summary of the sheet: top-line totals + per-hub breakdown, rendered in the
  // email body above the attached Excel. Pure aggregation of the same rows.
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const totals = rows.reduce(
    (t, r) => {
      t.collected += r.total_paid;
      t.weekly += r.weekly_rent ?? 0;
      t.pending += r.pending_amount;
      t.overdue += r.overdue_amount;
      if (r.pending_amount > 0) t.pendingRiders += 1;
      if (r.overdue_amount > 0) t.overdueRiders += 1;
      return t;
    },
    { collected: 0, weekly: 0, pending: 0, overdue: 0, pendingRiders: 0, overdueRiders: 0 }
  );

  const hubMap = new Map<string, { riders: number; weekly: number; pending: number; overdue: number }>();
  for (const r of rows) {
    const hub = r.hub_name ?? "Unassigned";
    const h = hubMap.get(hub) ?? { riders: 0, weekly: 0, pending: 0, overdue: 0 };
    h.riders += 1;
    h.weekly += r.weekly_rent ?? 0;
    h.pending += r.pending_amount;
    h.overdue += r.overdue_amount;
    hubMap.set(hub, h);
  }
  const hubRows = [...hubMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const tile = (label: string, value: string, sub = "", color = "#222") => `
    <td style="padding:12px 16px;border:1px solid #eee;border-radius:6px;vertical-align:top;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color};margin-top:4px;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#999;margin-top:2px;">${sub}</div>` : ""}
    </td>`;

  const hubTableRows = hubRows.map(([hub, h]) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${hub}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${h.riders}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${inr(h.weekly)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#d68910;">${inr(h.pending)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#e17055;">${inr(h.overdue)}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;">
      <h2 style="margin:0 0 4px;">Fleet & Rider Rent Status — ${stamp}</h2>
      <p style="color:#555;margin:0 0 16px;">${rows.length} active assignment(s). Full detail in the attached Excel.</p>
      <table style="border-collapse:separate;border-spacing:8px 0;margin-bottom:8px;"><tbody><tr>
        ${tile("Active", String(rows.length), "vehicles on rent")}
        ${tile("Collected till date", inr(totals.collected))}
        ${tile("Weekly run-rate", inr(totals.weekly))}
      </tr><tr>
        ${tile("Pending", inr(totals.pending), `${totals.pendingRiders} rider(s), 0–2 days`, "#d68910")}
        ${tile("Overdue", inr(totals.overdue), `${totals.overdueRiders} rider(s), >2 days`, "#e17055")}
      </tr></tbody></table>

      <h3 style="margin:20px 0 8px;">By Hub</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;">
            <th style="padding:6px 10px;">Hub</th>
            <th style="padding:6px 10px;text-align:right;">Riders</th>
            <th style="padding:6px 10px;text-align:right;">Weekly Rent</th>
            <th style="padding:6px 10px;text-align:right;">Pending</th>
            <th style="padding:6px 10px;text-align:right;">Overdue</th>
          </tr>
        </thead>
        <tbody>${hubTableRows}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid #ddd;">
            <td style="padding:6px 10px;">Total</td>
            <td style="padding:6px 10px;text-align:right;">${rows.length}</td>
            <td style="padding:6px 10px;text-align:right;">${inr(totals.weekly)}</td>
            <td style="padding:6px 10px;text-align:right;color:#d68910;">${inr(totals.pending)}</td>
            <td style="padding:6px 10px;text-align:right;color:#e17055;">${inr(totals.overdue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  const text = [
    `Fleet & Rider Rent Status — ${stamp}`,
    `${rows.length} active assignments`,
    `Collected till date: ${inr(totals.collected)}`,
    `Weekly run-rate: ${inr(totals.weekly)}`,
    `Pending: ${inr(totals.pending)} (${totals.pendingRiders} riders, 0–2 days)`,
    `Overdue: ${inr(totals.overdue)} (${totals.overdueRiders} riders, >2 days)`,
    ``,
    `Full detail in the attached Excel.`,
  ].join("\n");

  await sendEmail({
    to: recipients,
    subject: `Fleet & Rider Rent Status — ${stamp}`,
    text,
    html,
    attachments: [{
      filename: `fleet-rent-status-${stamp}.xlsx`,
      content: Buffer.from(buffer),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });

  return NextResponse.json({ sent: true, recipients: recipients.length, rows: rows.length });
}
