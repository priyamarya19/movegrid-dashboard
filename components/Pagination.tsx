"use client";

// Shared Prev/Next pager for server-paginated tables. Render it under a table and
// feed it the page state; it stays hidden when everything fits on one page.
export default function Pagination({
  page, pageSize, total, loaded, loading, onPage,
}: {
  page: number;
  pageSize: number;
  total: number | null;
  loaded: number; // rows currently shown (for the range end)
  loading: boolean;
  onPage: (updater: (p: number) => number) => void;
}) {
  if (total == null || total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = (page - 1) * pageSize + loaded;

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted tabular-nums">Showing {rangeStart}–{rangeEnd} of {total}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <span className="text-muted text-xs tabular-nums">Page {page} of {totalPages}</span>
        <button
          onClick={() => onPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          className="px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
