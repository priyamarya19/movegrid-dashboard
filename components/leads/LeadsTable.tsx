"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import { fetchList } from "@/lib/listFetch";

const PAGE_SIZE = 25;

type Lead = {
  id: string; type: string; name: string; phone: string;
  email: string; city: string; fleet_size: string;
  amount: string; status: string; created_at: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

const statusOptions = ["new", "contacted", "converted", "rejected"];

const statusColor: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  contacted: "bg-accent-warning/20 text-accent-warning-text",
  converted: "bg-accent-success/20 text-accent-success-text",
  rejected: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const typeColor: Record<string, string> = {
  investor: "text-purple-400",
  rider: "text-accent-success",
  fleet: "text-blue-400",
};

const cols: { label: string; key: string; sortable: boolean }[] = [
  { label: "Name", key: "name", sortable: true },
  { label: "Type", key: "type", sortable: true },
  { label: "Phone", key: "phone", sortable: true },
  { label: "Details", key: "city", sortable: true },
  { label: "Status", key: "status", sortable: true },
  { label: "Date", key: "created_at", sortable: true },
];

function sortData(data: Lead[], sort: Sort): Lead[] {
  return [...data].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.key];
    const bv = (b as Record<string, unknown>)[sort.key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = String(av).localeCompare(String(bv));
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const r = await fetchList<Lead>(`/api/leads?${params}`);
    setLoadError(!r.ok);
    setTotal(r.total);
    setLeads(r.rows);
    setLoading(false);
  }, [typeFilter, statusFilter, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await fetchLeads();
    setUpdating(null);
  };

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = sortData(leads, sort);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-primary text-2xl font-bold">Leads</h1>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="leads" columns={cols} rows={sorted} />
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="bg-surface-alt border border-default rounded-xl px-3 py-2 text-sm text-secondary focus:outline-none focus:border-accent-success">
            <option value="">All Types</option>
            <option value="rider">Rider</option>
            <option value="fleet">Fleet</option>
            <option value="investor">Investor</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-surface-alt border border-default rounded-xl px-3 py-2 text-sm text-secondary focus:outline-none focus:border-accent-success">
            <option value="">All Status</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-surface-alt border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} tabIndex={0}
                    aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(c.key); } }}
                    className="text-left px-5 py-3 text-muted font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-secondary transition-colors">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center">
                  <p className="text-accent-danger-alt-text text-sm">Couldn&apos;t load leads.</p>
                  <button onClick={() => fetchLeads()} className="mt-2 text-xs text-accent-purple hover:underline">Try again</button>
                </td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No leads found</td></tr>
              ) : sorted.map((lead) => (
                <tr key={lead.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/leads/${lead.id}`} className="text-primary font-medium hover:text-accent-purple hover:underline transition-colors">{lead.name}</Link>
                  </td>
                  <td className={`px-5 py-3 font-medium capitalize ${typeColor[lead.type] ?? "text-secondary"}`}>{lead.type}</td>
                  <td className="px-5 py-3 text-muted">{lead.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-muted text-xs">
                    {lead.amount && <span>₹{lead.amount}</span>}
                    {lead.fleet_size && <span>{lead.fleet_size}</span>}
                    {lead.city && <span> · {lead.city}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select value={lead.status} disabled={updating === lead.id}
                      onChange={(e) => updateStatus(lead.id, e.target.value)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none ${statusColor[lead.status] ?? "bg-muted/20 text-muted"}`}>
                      {statusOptions.map((s) => (
                        <option key={s} value={s} className="bg-surface-alt text-primary">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-muted text-xs">
                    {new Date(lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} loaded={leads.length} loading={loading} onPage={setPage} />
    </div>
  );
}
