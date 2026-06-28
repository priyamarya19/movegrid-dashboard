"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";
import { VSTATUS, VEHICLE_FILTERS, vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

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

function sortData(data: Vehicle[], sort: Sort): Vehicle[] {
  return [...data].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.key];
    const bv = (b as Record<string, unknown>)[sort.key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

export default function VehiclesTable() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "ev_number", dir: "asc" });

  const fetch_ = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/vehicles?${params}`);
    setVehicles(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, [statusFilter]);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = sortData(vehicles, sort);
  const counts = vehicles.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Vehicles</h1>
          <p className="text-[#666] text-sm mt-1">{vehicles.length} total • {counts[VSTATUS.assigned] || 0} assigned · {counts[VSTATUS.available] || 0} available · {counts[VSTATUS.maintenance] || 0} maintenance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="vehicles" columns={cols} rows={sorted} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#12121A] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[#6C5CE7]">
            {VEHICLE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Link href="/vehicles/new"
            className="inline-flex items-center gap-2 bg-[#6C5CE7] hover:bg-[#7c6cf7] text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Vehicle
          </Link>
        </div>
      </div>

      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider font-medium cursor-pointer select-none hover:text-[#aaa] transition-colors">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[#555]">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[#555]">No vehicles found</td></tr>
              ) : sorted.map((v) => (
                <tr key={v.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/vehicles/${v.id}`} className="text-[#6C5CE7] font-medium hover:underline">{v.ev_number}</Link>
                  </td>
                  <td className="px-5 py-3 text-white">{v.model_name ?? "—"} <span className="text-[#555] text-xs">{v.oem}</span></td>
                  <td className="px-5 py-3">
                    {v.hub_id ? <Link href={`/hubs/${v.hub_id}`} className="text-[#aaa] hover:text-[#6C5CE7] hover:underline transition-colors">{v.hub_name}</Link> : <span className="text-[#555]">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {v.investor_id ? <Link href={`/investors/${v.investor_id}`} className="text-[#00D1B2] hover:underline">{v.investor_name}</Link> : <span className="text-[#555]">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {v.rider_id ? <Link href={`/riders/${v.rider_id}`} className="text-[#aaa] hover:text-[#fdcb6e] hover:underline transition-colors">{v.assigned_rider}</Link> : <span className="text-[#555]">—</span>}
                  </td>
                  <td className="px-5 py-3 text-[#555] text-xs">{v.purchase_date ? new Date(v.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-[#fdcb6e]">{v.price ? "₹" + Number(v.price).toLocaleString() : "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vehicleStatusColor[v.status] ?? "bg-gray-500/20 text-gray-400"}`}>{vehicleStatusLabel(v.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
