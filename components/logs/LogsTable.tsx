"use client";

import { useCallback, useEffect, useState } from "react";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import { fetchList } from "@/lib/listFetch";
import { timeAgo } from "@/lib/format";

const PAGE_SIZE = 25;

type Log = {
  id: string; action: string; entity: string; entity_id: string;
  actor_id: string; details: string; ip_address: string; created_at: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

const dotColor: Record<string, string> = {
  onboard_rider: "var(--accent-teal)",
  assign_vehicle: "var(--accent-purple)",
  record_payment: "var(--accent-warning)",
  update_lead: "var(--accent-danger)",
  payout_marked: "var(--accent-purple-2)",
  new_lead: "var(--accent-teal)",
};

const cols: { label: string; key: string }[] = [
  { label: "Action", key: "action" },
  { label: "Entity", key: "entity" },
  { label: "Details", key: "details" },
  { label: "IP Address", key: "ip_address" },
  { label: "Time", key: "created_at" },
];

function sortData(data: Log[], sort: Sort): Log[] {
  return [...data].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.key];
    const bv = (b as Record<string, unknown>)[sort.key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = String(av).localeCompare(String(bv));
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

export default function LogsTable() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("action", filter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const r = await fetchList<Log>(`/api/logs?${params}`);
    setLoadError(!r.ok);
    setTotal(r.total);
    setLogs(r.rows);
    setLoading(false);
  }, [filter, page]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = sortData(logs, sort);
  const actions = [...new Set(logs.map(l => l.action))];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted text-sm mt-1">{total ?? logs.length} entries — complete activity trail</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="audit-logs" columns={cols} rows={sorted} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-secondary focus:outline-none focus:border-accent-purple">
          <option value="">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </select>
        </div>
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} tabIndex={0}
                    aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(c.key); } }}
                    className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium cursor-pointer select-none hover:text-secondary transition-colors">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center">
                  <p className="text-accent-danger-alt-text text-sm">Couldn&apos;t load logs.</p>
                  <button onClick={() => fetch_()} className="mt-2 text-xs text-accent-purple hover:underline">Try again</button>
                </td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No logs found</td></tr>
              ) : sorted.map((log) => (
                <tr key={log.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[log.action] ?? "var(--text-muted)" }} />
                      <span className="text-primary capitalize">{log.action.replace(/_/g, " ")}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-accent-purple capitalize">{log.entity}</td>
                  <td className="px-5 py-3 text-secondary text-xs max-w-xs truncate">
                    {log.details
                      ? typeof log.details === "object"
                        ? Object.entries(log.details as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(" · ")
                        : String(log.details)
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted text-xs">{log.ip_address ?? "—"}</td>
                  <td className="px-5 py-3 text-muted text-xs">
                    <span title={new Date(log.created_at).toLocaleString("en-IN")}>{timeAgo(log.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} loaded={logs.length} loading={loading} onPage={setPage} />
    </div>
  );
}
