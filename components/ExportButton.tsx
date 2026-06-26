"use client";

// Reusable "download table as Excel (CSV)" button.
// CSV opens natively in Excel/Google Sheets; the UTF-8 BOM keeps unicode intact.
export type ExportColumn<T = Record<string, unknown>> = {
  label: string;
  key: string;
  // optional formatter for derived/boolean/date values
  value?: (row: T) => unknown;
};

function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => esc(c.value ? c.value(r) : (r as Record<string, unknown>)[c.key])).join(",")
  ).join("\r\n");
  return header + "\r\n" + body;
}

export default function ExportButton<T>({
  filename, columns, rows, label = "Export",
}: {
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
  label?: string;
}) {
  function download() {
    const csv = toCsv(columns, rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filename}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={!rows.length}
      title={rows.length ? "Download as Excel/CSV" : "Nothing to export"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#2a2a3a] text-[#aaa] hover:border-[#00D1B2]/50 hover:text-[#00D1B2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  );
}
