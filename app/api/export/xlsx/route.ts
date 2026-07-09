import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSession } from "@/lib/auth";

// POST /api/export/xlsx — turns any table (columns + already-formatted rows) into a real
// .xlsx file. Shared by ExportButton so every "download" across the app is one code path.
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const { filename, columns, rows } = await req.json();
  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    return NextResponse.json({ error: "columns and rows are required" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.columns = columns.map((c: { label: string; key: string }) => ({
    header: c.label, key: c.key, width: Math.max(c.label.length + 4, 14),
  }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${(filename || "export").replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx"`,
    },
  });
}
