"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string; action: string; entity: string; entity_id: string;
  actor_id: string; details: string; ip_address: string; created_at: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

const dotColor: Record<string, string> = {
  onboard_rider: "#00D1B2",
  assign_vehicle: "#6C5CE7",
  record_payment: "#fdcb6e",
  update_lead: "#e17055",
  payout_marked: "#a29bfe",
  new_lead: "#00D1B2",
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  const fetch_ = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("action", filter);
    const res = await fetch(`/api/logs?${params}`);
    setLogs(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, [filter]);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const sorted = sortData(logs, sort);
  const actions = [...new Set(logs.map(l => l.action))];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Audit Logs</h1>
          <p className="text-[#666] text-sm mt-1">{logs.length} entries — complete activity trail</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="bg-[#12121A] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[#6C5CE7]">
          <option value="">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </select>
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
                <tr><td colSpan={5} className="px-5 py-10 text-center text-[#555]">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-[#555]">No logs found</td></tr>
              ) : sorted.map((log) => (
                <tr key={log.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[log.action] ?? "#666" }} />
                      <span className="text-white capitalize">{log.action.replace(/_/g, " ")}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[#6C5CE7] capitalize">{log.entity}</td>
                  <td className="px-5 py-3 text-[#aaa] text-xs max-w-xs truncate">
                    {log.details
                      ? typeof log.details === "object"
                        ? Object.entries(log.details as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(" · ")
                        : String(log.details)
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-[#555] text-xs">{log.ip_address ?? "—"}</td>
                  <td className="px-5 py-3 text-[#555] text-xs">
                    <span title={new Date(log.created_at).toLocaleString("en-IN")}>{timeAgo(log.created_at)}</span>
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
