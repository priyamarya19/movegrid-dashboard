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

  await sendEmail({
    to: recipients,
    subject: `Fleet & Rider Rent Status — ${stamp}`,
    text: `Attached: fleet & rider rent status for ${stamp} (${rows.length} active assignments).`,
    attachments: [{
      filename: `fleet-rent-status-${stamp}.xlsx`,
      content: Buffer.from(buffer),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });

  return NextResponse.json({ sent: true, recipients: recipients.length, rows: rows.length });
}
