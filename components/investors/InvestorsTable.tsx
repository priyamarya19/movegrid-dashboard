"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Investor = {
  id: string; name: string; email: string; mobile: string;
  total_invested: number; investment_date: string; status: string;
  vehicle_count: number; total_paid: number; pending_amount: number;
  bank: string | null; account_number: string | null; ifsc: string | null; bank_status: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

const cols: { label: string; key: string }[] = [
  { label: "Name", key: "name" },
  { label: "Mobile", key: "mobile" },
  { label: "Invested", key: "total_invested" },
  { label: "Vehicles", key: "vehicle_count" },
  { label: "Total Paid", key: "total_paid" },
  { label: "Pending", key: "pending_amount" },
  { label: "Inv. Date", key: "investment_date" },
  { label: "Status", key: "status" },
];

function sortData(data: Investor[], sort: Sort): Investor[] {
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

export default function InvestorsTable() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>({ key: "total_invested", dir: "desc" });
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = () =>
    fetch("/api/investors").then(r => r.json()).then(data => { setInvestors(data); setLoading(false); });

  useEffect(() => { load(); }, []);

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  async function verifyBank(id: string) {
    setVerifying(id);
    try {
      const res = await fetch(`/api/investors/${id}/verify-bank`, { method: "POST" });
      if (res.ok) await load();
    } finally { setVerifying(null); }
  }

  const sorted = sortData(investors, sort);
  const totalInvested = investors.reduce((a, i) => a + Number(i.total_invested), 0);
  const totalPending = investors.reduce((a, i) => a + Number(i.pending_amount), 0);
  const pendingBank = investors.filter((i) => i.bank_status === "pending");

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">Investors</h1>
          <p className="text-muted text-sm mt-1">{investors.length} investors · ₹{(totalInvested / 100000).toFixed(1)}L total invested · ₹{(totalPending / 100000).toFixed(1)}L pending payouts</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton filename="investors" columns={cols} rows={sorted} />
          <Link href="/investors/new" className="px-4 py-2.5 rounded-xl bg-accent-purple hover:bg-accent-purple text-primary text-sm font-semibold transition-colors shrink-0">
            + Add Investor
          </Link>
        </div>
      </div>

      {/* Bank verification notifications */}
      {pendingBank.length > 0 && (
        <div className="bg-accent-warning/10 border border-accent-warning/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <p className="text-accent-warning-text text-sm font-semibold">
              {pendingBank.length} bank {pendingBank.length === 1 ? "change" : "changes"} awaiting verification
            </p>
          </div>
          {pendingBank.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 bg-surface border border-default rounded-lg px-4 py-3">
              <div className="min-w-0">
                <Link href={`/investors/${inv.id}`} className="text-primary text-sm font-medium hover:text-accent-teal">{inv.name}</Link>
                <p className="text-muted text-xs mt-0.5 truncate">
                  {inv.bank ?? "—"} · A/C {inv.account_number ?? "—"} · {inv.ifsc ?? "—"}
                </p>
              </div>
              <button
                onClick={() => verifyBank(inv.id)}
                disabled={verifying === inv.id}
                className="shrink-0 px-4 py-1.5 rounded-lg bg-accent-success/20 text-accent-success-text hover:bg-accent-success/30 text-xs font-semibold disabled:opacity-60 transition-colors"
              >
                {verifying === inv.id ? "Verifying..." : "Mark verified"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Investors", value: investors.length.toString(), color: "var(--accent-purple)" },
          { label: "Total Invested", value: "₹" + (totalInvested / 100000).toFixed(1) + "L", color: "var(--accent-teal)" },
          { label: "Pending Payouts", value: "₹" + (totalPending / 100000).toFixed(1) + "L", color: "var(--accent-danger)" },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
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
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : sorted.map((inv) => (
                <tr key={inv.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/investors/${inv.id}`} className="text-primary font-medium hover:text-accent-teal hover:underline transition-colors">{inv.name}</Link>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-secondary">{inv.mobile}</p>
                    <p className="text-muted text-xs">{inv.email}</p>
                  </td>
                  <td className="px-5 py-3 text-accent-teal font-semibold">₹{Number(inv.total_invested).toLocaleString()}</td>
                  <td className="px-5 py-3 text-accent-purple font-semibold">{inv.vehicle_count}</td>
                  <td className="px-5 py-3 text-accent-success-text">₹{Number(inv.total_paid).toLocaleString()}</td>
                  <td className="px-5 py-3 text-accent-danger">₹{Number(inv.pending_amount).toLocaleString()}</td>
                  <td className="px-5 py-3 text-muted text-xs">{inv.investment_date ? new Date(inv.investment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${inv.status === "active" ? "bg-accent-success/20 text-accent-success-text" : "bg-muted/20 text-muted"}`}>{inv.status}</span>
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
