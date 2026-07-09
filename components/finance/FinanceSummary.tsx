"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";

type Buckets = { tillDate: number; mtd: number; lmtd: number; today: number; yesterday: number; lastWeek: number };
type Summary = { total: Buckets; bySource: { rent: Buckets; penalties: Buckets; feesDeposits: Buckets } };
type DetailRow = { date: string; source: string; rider_name: string; amount: number };

const COLUMNS: { key: keyof Buckets; label: string }[] = [
  { key: "tillDate", label: "Till Date" },
  { key: "mtd", label: "MTD" },
  { key: "lmtd", label: "LMTD" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "lastWeek", label: "Last Week" },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function FinanceSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/finance")
      .then((r) => r.json())
      .then((data) => { setSummary(data.summary); setDetail(data.detail); })
      .finally(() => setLoading(false));
  }, []);

  const rows = summary
    ? [
        { label: "Rent", sourceKey: "rent", buckets: summary.bySource.rent },
        { label: "Penalties", sourceKey: "penalties", buckets: summary.bySource.penalties },
        { label: "Onboarding Fee + Deposit", sourceKey: "feesDeposits", buckets: summary.bySource.feesDeposits },
        { label: "Total", sourceKey: "total", buckets: summary.total, isTotal: true },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-primary text-2xl font-bold">Finance</h1>
          <p className="text-muted text-sm mt-1">All money collected — rent, penalties, onboarding fees & deposits</p>
        </div>
        <ExportButton
          filename="finance-detail"
          label="Download Excel"
          columns={[
            { label: "Date", key: "date" },
            { label: "Source", key: "source" },
            { label: "Rider", key: "rider_name" },
            { label: "Amount", key: "amount" },
          ]}
          rows={detail}
        />
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">Source</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-right px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNS.length + 1} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : rows.map((row) => (
                <tr
                  key={row.label}
                  className={row.isTotal ? "bg-overlay-hover border-t border-default" : "border-b border-subtle hover:bg-overlay-hover"}
                >
                  <td className={`px-5 py-3.5 whitespace-nowrap ${row.isTotal ? "text-primary font-semibold" : "text-secondary"}`}>{row.label}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/finance/detail?source=${row.sourceKey}&bucket=${c.key}`}
                        className={`hover:underline ${row.isTotal ? "text-accent-success font-semibold" : "text-primary"}`}
                      >
                        {inr(row.buckets[c.key])}
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
