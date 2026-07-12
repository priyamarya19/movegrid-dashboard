"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import { VSTATUS, VEHICLE_FILTERS, vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

const PAGE_SIZE = 25;

type Vehicle = {
  id: string; ev_number: string; status: string;
  model_name: string; oem: string;
  hub_id: string; hub_name: string;
  investor_id: string; investor_name: string;
  rider_id: string; assigned_rider: string;
  purchase_date: string; price: number;
};

type Sort = { key: string; dir: "asc" | "desc" };

const cols: { label: string; key: string }[] = [
  { label: "EV Number", key: "ev_number" },
  { label: "Model", key: "model_name" },
  { label: "Hub", key: "hub_name" },
  { label: "Investor", key: "investor_name" },
  { label: "Assigned Rider", key: "assigned_rider" },
  { label: "Purchase Date", key: "purchase_date" },
  { label: "Price", key: "price" },
  { label: "Status", key: "status" },
];

// Columns the server can sort on (others fall back to EV-number order).
const SORTABLE_KEYS = new Set(["ev_number", "status", "model_name"]);

export default function VehiclesTable({ statusFilter: initialStatus }: { statusFilter?: string | null } = {}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [serverCounts, setServerCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "ev_number", dir: "asc" });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("sort", sort.key);
    params.set("dir", sort.dir);
    if (debouncedQ) params.set("q", debouncedQ);
    const res = await fetch(`/api/vehicles?${params}`);
    const t = res.headers.get("X-Total-Count");
    setTotal(t ? Number(t) : null);
    const sc = res.headers.get("X-Status-Counts");
    setServerCounts(sc ? JSON.parse(sc) : null);
    setVehicles(await res.json());
    setLoading(false);
  }, [statusFilter, page, sort, debouncedQ]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const toggleSort = (key: string) => {
    if (!SORTABLE_KEYS.has(key)) return; // only server-sortable columns
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
    setPage(1);
  };

  const fetchAllForExport = useCallback(async (): Promise<Vehicle[]> => {
    const base = new URLSearchParams();
    if (statusFilter) base.set("status", statusFilter);
    base.set("sort", sort.key); base.set("dir", sort.dir); base.set("pageSize", "100");
    if (debouncedQ) base.set("q", debouncedQ);
    const all: Vehicle[] = [];
    for (let p = 1; ; p++) {
      base.set("page", String(p));
      const res = await fetch(`/api/vehicles?${base}`);
      const batch: Vehicle[] = await res.json();
      all.push(...batch);
      const t = Number(res.headers.get("X-Total-Count") || all.length);
      if (all.length >= t || batch.length === 0) break;
    }
    return all;
  }, [statusFilter, sort, debouncedQ]);

  // Server already filtered + sorted; render as-is.
  const sorted = vehicles;
  const counts = serverCounts ?? vehicles.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">Vehicles</h1>
          <p className="text-muted text-sm mt-1">{total ?? vehicles.length} total • {counts[VSTATUS.assigned] || 0} assigned · {counts[VSTATUS.available] || 0} available · {counts[VSTATUS.maintenance] || 0} maintenance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vehicle number"
            className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-primary placeholder-faint focus:outline-none focus:border-accent-purple w-48"
          />
          <ExportButton filename="vehicles" columns={cols} rows={sorted} fetchAllRows={fetchAllForExport} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-secondary focus:outline-none focus:border-accent-purple">
            {VEHICLE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Link href="/vehicles/new"
            className="inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-purple text-primary text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Vehicle
          </Link>
        </div>
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium cursor-pointer select-none hover:text-secondary transition-colors">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">No vehicles found</td></tr>
              ) : sorted.map((v) => (
                <tr key={v.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/vehicles/${v.id}`} className="text-accent-purple font-medium hover:underline">{v.ev_number}</Link>
                  </td>
                  <td className="px-5 py-3 text-primary">{v.model_name ?? "—"} <span className="text-muted text-xs">{v.oem}</span></td>
                  <td className="px-5 py-3">
                    {v.hub_id ? <Link href={`/hubs/${v.hub_id}`} className="text-secondary hover:text-accent-purple hover:underline transition-colors">{v.hub_name}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {v.investor_id ? <Link href={`/investors/${v.investor_id}`} className="text-accent-teal hover:underline">{v.investor_name}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {v.rider_id ? <Link href={`/riders/${v.rider_id}`} className="text-secondary hover:text-accent-warning hover:underline transition-colors">{v.assigned_rider}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted text-xs">{v.purchase_date ? new Date(v.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-accent-warning">{v.price ? "₹" + Number(v.price).toLocaleString() : "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vehicleStatusColor[v.status] ?? "bg-muted/20 text-muted"}`}>{vehicleStatusLabel(v.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} loaded={vehicles.length} loading={loading} onPage={setPage} />
    </div>
  );
}
