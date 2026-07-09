"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Row = { date: string; source: string; rider_id: string; rider_name: string; amount: number };

const sourceLabel: Record<string, string> = {
  rent: "Rent", penalties: "Penalties", feesDeposits: "Onboarding Fee + Deposit", total: "Total",
};
const bucketLabel: Record<string, string> = {
  tillDate: "Till Date", mtd: "MTD", lmtd: "LMTD", today: "Today", yesterday: "Yesterday", lastWeek: "Last Week",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function FinanceDetail({ source, bucket }: { source: string; bucket: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finance/detail?source=${source}&bucket=${bucket}`)
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .finally(() => setLoading(false));
  }, [source, bucket]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/finance" className="text-[#555] hover:text-[#aaa] text-sm transition-colors">← Finance</Link>
            <span className="text-[#333]">/</span>
            <h1 className="text-white text-2xl font-bold">{sourceLabel[source] ?? source} — {bucketLabel[bucket] ?? bucket}</h1>
          </div>
          <p className="text-[#666] text-sm mt-1">
            {loading ? "Loading…" : `${rows.length} payment${rows.length !== 1 ? "s" : ""} · ${inr(total)} total`}
          </p>
        </div>
        <ExportButton
          filename={`finance-${source}-${bucket}`}
          columns={[
            { label: "Date", key: "date" },
            { label: "Source", key: "source" },
            { label: "Rider", key: "rider_name" },
            { label: "Amount", key: "amount" },
          ]}
          rows={rows}
        />
      </div>

      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Date", "Source", "Rider", "Amount"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-[#555]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-[#555]">No payments in this period</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-[#aaa] whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-[#aaa]">{r.source}</td>
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.rider_id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline transition-colors">
                      {r.rider_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[#00D1B2] font-semibold">{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
