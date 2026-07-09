"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Rider = {
  id: string; rider_code: string; name: string; mobile: string; status: string;
  hub_id: string; hub_name: string;
  vehicle_id: string; vehicle_number: string;
  onboarding_fee: number; security_deposit: number;
  rental_mode: string; business_type: string; b2b_company: string; b2b_location: string;
  employer: string;
  created_at: string;
  aadhaar_verified: boolean; pan_verified: boolean; dl_verified: boolean;
  rent_received_this_month: boolean;
};

type Sort = { key: string; dir: "asc" | "desc" };

const statusColor: Record<string, string> = {
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  suspended: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const cols: { label: string; key: string }[] = [
  { label: "User ID", key: "rider_code" },
  { label: "Name", key: "name" },
  { label: "Mobile", key: "mobile" },
  { label: "Hub", key: "hub_name" },
  { label: "Vehicle", key: "vehicle_number" },
  { label: "Employer", key: "employer" },
  { label: "Rent Cycle", key: "rental_mode" },
  { label: "KYC", key: "aadhaar_verified" },
  { label: "Status", key: "status" },
  { label: "Rent", key: "rent_received_this_month" },
  { label: "Joined", key: "created_at" },
];

function sortData(data: Rider[], sort: Sort): Rider[] {
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

function RentToggle({ rider, onToggled }: { rider: Rider; onToggled: () => void }) {
  const [loading, setLoading] = useState(false);

  // No rent status for riders with no active vehicle (new/unallotted riders owe nothing).
  if (rider.status !== "active" || !rider.vehicle_id) return <span className="text-faint">—</span>;

  async function markReceived() {
    if (rider.rent_received_this_month) return;
    setLoading(true);
    const today = new Date();
    const period_start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const period_end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];
    await fetch(`/api/riders/${rider.id}/rent-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_start, period_end }),
    });
    setLoading(false);
    onToggled();
  }

  return rider.rent_received_this_month ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-success/15 text-accent-success-text whitespace-nowrap">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      Received
    </span>
  ) : (
    <button
      onClick={markReceived}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-default text-muted hover:bg-accent-warning/13 hover:text-accent-warning transition-colors whitespace-nowrap disabled:opacity-50"
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {loading ? "..." : "Due"}
    </button>
  );
}

export default function RidersTable({ rentFilter, statusFilter: initialStatus }: { rentFilter?: string | null; statusFilter?: string | null }) {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  // Seed the status filter from the URL (e.g. /riders?status=pending from the KYC badge).
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  const fetchRiders = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (rentFilter && !statusFilter) params.set("rent", rentFilter);
    const res = await fetch(`/api/riders?${params}`);
    setRiders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRiders(); }, [statusFilter, rentFilter]);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  // Search by user ID or name only.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? riders.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.rider_code?.toLowerCase().includes(q))
    : riders;
  const sorted = sortData(filtered, sort);
  const counts = riders.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">
            Riders{rentFilter === "overdue" ? " — Overdue Rent" : rentFilter === "due_soon" ? " — Due in 2 Days" : ""}
          </h1>
          <p className="text-muted text-sm mt-1">{riders.length} riders • {counts["active"] || 0} active · {counts["inactive"] || 0} inactive</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or user ID"
            className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-primary placeholder-faint focus:outline-none focus:border-accent-purple w-48"
          />
          <ExportButton filename="riders" columns={cols} rows={sorted} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-secondary focus:outline-none focus:border-accent-purple">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
          <Link href="/riders/new"
            className="inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-purple text-primary text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Rider
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
                    className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium cursor-pointer select-none hover:text-secondary transition-colors whitespace-nowrap">
                    {c.label}
                    <span className="ml-1 opacity-60">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-muted">No riders found</td></tr>
              ) : sorted.map((r) => (
                <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="font-mono text-xs text-accent-purple font-semibold hover:underline">{r.rider_code ?? "—"}</Link>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-primary font-medium hover:text-accent-purple hover:underline transition-colors">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-secondary">{r.mobile}</td>
                  <td className="px-5 py-3">
                    {r.hub_id ? <Link href={`/hubs/${r.hub_id}`} className="text-secondary hover:text-accent-purple hover:underline transition-colors">{r.hub_name}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {r.vehicle_id ? <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-purple font-medium hover:underline">{r.vehicle_number}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3 text-secondary text-xs">{r.employer || "—"}</td>
                  <td className="px-5 py-3 text-secondary capitalize">{r.rental_mode ?? "—"}</td>
                  <td className="px-5 py-3">
                    {r.aadhaar_verified && r.pan_verified && r.dl_verified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-teal/13 text-accent-teal">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-warning/13 text-accent-warning">
                        Unverified
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[r.status] ?? "bg-muted/20 text-muted"}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <RentToggle rider={r} onToggled={fetchRiders} />
                  </td>
                  <td className="px-5 py-3 text-muted text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
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
