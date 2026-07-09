"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Hub = {
  id: string; hub_id: string; hub_name: string;
  city: string; area: string; vehicle_capacity: number;
  active_riders: number; assigned_vehicles: number; available_vehicles: number;
};

type Sort = { key: string; dir: "asc" | "desc" };

const cols: { label: string; key: string }[] = [
  { label: "Hub Name", key: "hub_name" },
  { label: "Location", key: "city" },
  { label: "Capacity", key: "vehicle_capacity" },
  { label: "Active Riders", key: "active_riders" },
  { label: "Assigned Vehicles", key: "assigned_vehicles" },
  { label: "Available Vehicles", key: "available_vehicles" },
];

function sortData(data: Hub[], sort: Sort): Hub[] {
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

export default function HubsTable({ role }: { role: string }) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>({ key: "hub_name", dir: "asc" });

  useEffect(() => {
    fetch("/api/hubs").then(r => r.json()).then(data => { setHubs(data); setLoading(false); });
  }, []);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = sortData(hubs, sort);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">Hubs</h1>
          <p className="text-muted text-sm mt-1">{hubs.length} hubs</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="hubs" columns={cols} rows={sorted} />
          {role === "admin" && (
            <Link href="/hubs/new"
              className="inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-purple text-primary text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Hub
            </Link>
          )}
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
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No hubs found</td></tr>
              ) : sorted.map((h) => (
                <tr key={h.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/hubs/${h.id}`} className="text-accent-purple font-medium hover:underline">{h.hub_name}</Link>
                  </td>
                  <td className="px-5 py-3 text-secondary">{h.area}, {h.city}</td>
                  <td className="px-5 py-3 text-secondary">{h.vehicle_capacity}</td>
                  <td className="px-5 py-3 text-accent-teal font-semibold">{h.active_riders}</td>
                  <td className="px-5 py-3 text-accent-warning font-semibold">{h.assigned_vehicles}</td>
                  <td className="px-5 py-3 text-accent-purple-2 font-semibold">{h.available_vehicles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
