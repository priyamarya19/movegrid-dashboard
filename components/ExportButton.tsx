"use client";

import { useToast } from "@/components/Toast";

// Reusable "download table as Excel" button — hands formatted rows to
// /api/export/xlsx, which returns a real .xlsx via exceljs.
export type ExportColumn<T = Record<string, unknown>> = {
  label: string;
  key: string;
  // optional formatter for derived/boolean/date values
  value?: (row: T) => unknown;
};

export default function ExportButton<T>({
  filename, columns, rows, label = "Export", fetchAllRows,
}: {
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
  label?: string;
  // When the visible `rows` are only one page (server pagination), supply this to
  // export the full matching set — it's awaited on click instead of using `rows`.
  fetchAllRows?: () => Promise<T[]>;
}) {
  const toast = useToast();
  async function download() {
    const source = fetchAllRows ? await fetchAllRows() : rows;
    const flatRows = source.map((r) =>
      Object.fromEntries(
        columns.map((c) => [c.key, c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]])
      )
    );
    const res = await fetch("/api/export/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        columns: columns.map((c) => ({ label: c.label, key: c.key })),
        rows: flatRows,
      }),
    });
    if (!res.ok) {
      toast.show("Export failed. Try again.", "error");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filename}-${stamp}.xlsx`;
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
      title={rows.length ? "Download as Excel" : "Nothing to export"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-strong text-secondary hover:border-accent-teal/50 hover:text-accent-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  );
}
