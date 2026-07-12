"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import { fetchList } from "@/lib/listFetch";
import RecordPayment from "@/components/riders/RecordPayment";

type Rider = {
  id: string; rider_code: string; name: string; mobile: string; status: string;
  hub_id: string; hub_name: string;
  vehicle_id: string; vehicle_number: string;
  onboarding_fee: number; security_deposit: number;
  rental_mode: string; business_type: string; b2b_company: string; b2b_location: string;
  employer: string;
  created_at: string;
  aadhaar_verified: boolean; pan_verified: boolean; dl_verified: boolean;
  daily_rent: string | number | null;
  rent_paid_this_week: boolean;
  allotment_code: string | null;   // active tenancy's allotment ID
  allotment_codes: string | null;  // all allotment IDs ever held, space-joined (for search)
};

type Sort = { key: string; dir: "asc" | "desc" };

const statusColor: Record<string, string> = {
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  suspended: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const cols: { label: string; key: string }[] = [
  { label: "Rider ID", key: "rider_code" },
  { label: "Name", key: "name" },
  { label: "Mobile", key: "mobile" },
  { label: "Hub", key: "hub_name" },
  { label: "Vehicle", key: "vehicle_number" },
  { label: "Employer", key: "employer" },
  { label: "Rent Cycle", key: "rental_mode" },
  { label: "KYC", key: "aadhaar_verified" },
  { label: "Status", key: "status" },
  { label: "Rent", key: "rent_paid_this_week" },
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
  // No rent status for riders with no active vehicle (new/unallotted riders owe nothing).
  if (rider.status !== "active" || !rider.vehicle_id) return <span className="text-faint">—</span>;

  return rider.rent_paid_this_week ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-success/15 text-accent-success-text whitespace-nowrap">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      Paid
    </span>
  ) : (
    <RecordPayment
      riderId={rider.id}
      dailyRent={rider.daily_rent != null ? Number(rider.daily_rent) : null}
      onRecorded={onToggled}
      compact
    />
  );
}

const PAGE_SIZE = 25;

export default function RidersTable({ rentFilter, statusFilter: initialStatus }: { rentFilter?: string | null; statusFilter?: string | null }) {
  // The overdue/due-soon alert views are bounded lists — keep them client-filtered.
  // The main riders list is server-paginated (search + sort + page all server-side)
  // so it stays correct and fast however large the fleet grows.
  const serverPaginate = !rentFilter;

  const [riders, setRiders] = useState<Rider[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [serverCounts, setServerCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  // Seed the status filter from the URL (e.g. /riders?status=pending from the KYC badge).
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: "desc" });

  // Debounce the search box so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (rentFilter && !statusFilter) params.set("rent", rentFilter);
    if (serverPaginate) {
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      params.set("sort", sort.key);
      params.set("dir", sort.dir);
      if (debouncedQ) params.set("q", debouncedQ);
    }
    const r = await fetchList<Rider>(`/api/riders?${params}`);
    setLoadError(!r.ok);
    setTotal(r.total);
    setServerCounts(r.counts);
    setRiders(r.rows);
    setLoading(false);
  }, [statusFilter, rentFilter, serverPaginate, page, sort, debouncedQ]);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  const toggleSort = (key: string) => {
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
    if (serverPaginate) setPage(1);
  };

  // Export the FULL matching set (all pages), not just the visible page — loops
  // 100 at a time until it has everything the current filters/search return.
  const fetchAllForExport = useCallback(async (): Promise<Rider[]> => {
    if (!serverPaginate) return riders;
    const base = new URLSearchParams();
    if (statusFilter) base.set("status", statusFilter);
    base.set("sort", sort.key); base.set("dir", sort.dir); base.set("pageSize", "100");
    if (debouncedQ) base.set("q", debouncedQ);
    const all: Rider[] = [];
    for (let p = 1; ; p++) {
      base.set("page", String(p));
      const res = await fetch(`/api/riders?${base}`);
      const batch: Rider[] = await res.json();
      all.push(...batch);
      const t = Number(res.headers.get("X-Total-Count") || all.length);
      if (all.length >= t || batch.length === 0) break;
    }
    return all;
  }, [serverPaginate, riders, statusFilter, sort, debouncedQ]);

  // Client-side filter/sort only in the bounded rent-alert mode; the paginated
  // list is already filtered and sorted by the server.
  const q = search.trim().toLowerCase();
  const filtered = serverPaginate
    ? riders
    : (q ? riders.filter((r) =>
        r.name?.toLowerCase().includes(q) ||
        r.rider_code?.toLowerCase().includes(q) ||
        r.allotment_codes?.toLowerCase().includes(q)) : riders);
  const sorted = serverPaginate ? riders : sortData(filtered, sort);
  const counts = serverPaginate && serverCounts
    ? serverCounts
    : riders.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);


  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">
            Riders{rentFilter === "overdue" ? " — Overdue Rent" : rentFilter === "due_soon" ? " — Due in 2 Days" : ""}
          </h1>
          <p className="text-muted text-sm mt-1">
            {total ?? riders.length} riders • {counts["active"] || 0} active · {counts["inactive"] || 0} inactive
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, rider ID or allotment ID"
            className="bg-surface border border-default rounded-xl px-3 py-2 text-sm text-primary placeholder-faint focus:outline-none focus:border-accent-purple w-48"
          />
          <ExportButton filename="riders" columns={cols} rows={sorted} fetchAllRows={serverPaginate ? fetchAllForExport : undefined} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
              ) : loadError ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center">
                  <p className="text-accent-danger-alt-text text-sm">Couldn&apos;t load riders.</p>
                  <button onClick={() => fetchRiders()} className="mt-2 text-xs text-accent-purple hover:underline">Try again</button>
                </td></tr>
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

      {serverPaginate && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} loaded={riders.length} loading={loading} onPage={setPage} />
      )}
    </div>
  );
}
