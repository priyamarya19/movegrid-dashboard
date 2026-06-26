"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Lead = {
  id: string; type: string; name: string; phone: string;
  email: string; city: string; fleet_size: string;
  amount: string; status: string; created_at: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

const statusOptions = ["new", "contacted", "converted", "rejected"];

const statusColor: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  contacted: "bg-yellow-500/20 text-yellow-400",
  converted: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const typeColor: Record<string, string> = {
  investor: "text-purple-400",
  rider: "text-[#00C48C]",
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
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  const fetchLeads = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [typeFilter, statusFilter]);

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
        <h1 className="text-white text-2xl font-bold">Leads</h1>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="leads" columns={cols} rows={sorted} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[#00C48C]">
            <option value="">All Types</option>
            <option value="rider">Rider</option>
            <option value="fleet">Fleet</option>
            <option value="investor">Investor</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[#00C48C]">
            <option value="">All Status</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-[#111118] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">No leads found</td></tr>
              ) : sorted.map((lead) => (
                <tr key={lead.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/leads/${lead.id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline transition-colors">{lead.name}</Link>
                  </td>
                  <td className={`px-5 py-3 font-medium capitalize ${typeColor[lead.type] ?? "text-gray-300"}`}>{lead.type}</td>
                  <td className="px-5 py-3 text-gray-400">{lead.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {lead.amount && <span>₹{lead.amount}</span>}
                    {lead.fleet_size && <span>{lead.fleet_size}</span>}
                    {lead.city && <span> · {lead.city}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select value={lead.status} disabled={updating === lead.id}
                      onChange={(e) => updateStatus(lead.id, e.target.value)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none ${statusColor[lead.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                      {statusOptions.map((s) => (
                        <option key={s} value={s} className="bg-[#111118] text-white">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
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
