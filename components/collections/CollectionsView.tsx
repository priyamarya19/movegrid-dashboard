"use client";

import { useState } from "react";
import Link from "next/link";
import type { WeeklyCollection, ChaseRow } from "@/lib/collections";

type Summary = { expectedToDate: number; collected: number; overdue: number; overdueRiders: number; pct: number };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtWk = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// Aging buckets by days behind. Colours are semantic (good→critical), separate
// from the brand accent.
const BUCKETS = [
  { key: "ok", label: "On track", test: (d: number) => d <= 0, cls: "text-accent-success-text", bar: "bg-accent-success", dot: "bg-accent-success" },
  { key: "s1", label: "1–7 days", test: (d: number) => d >= 1 && d <= 7, cls: "text-accent-warning-text", bar: "bg-accent-warning", dot: "bg-accent-warning" },
  { key: "s2", label: "8–14 days", test: (d: number) => d >= 8 && d <= 14, cls: "text-accent-danger-text", bar: "bg-accent-danger", dot: "bg-accent-danger" },
  { key: "s3", label: "15+ days", test: (d: number) => d >= 15, cls: "text-accent-danger-alt-text", bar: "bg-accent-danger-alt", dot: "bg-accent-danger-alt" },
] as const;

export default function CollectionsView({
  summary, weekly, chase,
}: { summary: Summary; weekly: WeeklyCollection[]; chase: ChaseRow[] }) {
  const [bucket, setBucket] = useState<string | null>(null);

  const owed = chase.filter((r) => r.outstanding > 0);
  const outstanding = owed.reduce((s, r) => s + r.outstanding, 0);
  const maxE = Math.max(1, ...weekly.map((w) => w.expected));

  const bsum = BUCKETS.map((b) => {
    const rs = chase.filter((r) => b.test(r.days_behind));
    return { ...b, riders: rs.length, amount: rs.reduce((s, r) => s + r.outstanding, 0) };
  });
  const owedTotal = bsum.slice(1).reduce((s, b) => s + b.amount, 0);

  const active = bucket ? bsum.find((b) => b.key === bucket) : null;
  const rows = (active ? chase.filter((r) => active.test(r.days_behind)) : owed).slice().sort((a, z) => z.outstanding - a.outstanding);

  const tiles = [
    { lbl: "Expected to date", val: inr(summary.expectedToDate), note: "all rent weeks started" },
    { lbl: "Collected", val: inr(summary.collected), note: `${summary.pct}% collection rate` },
    { lbl: "Outstanding now", val: inr(outstanding), note: "live balance, active riders" },
    { lbl: "Riders behind", val: `${owed.length} of ${chase.length}`, note: `${bsum[3].riders} are 15+ days late` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Collections</h1>
        <p className="text-muted text-sm mt-1">Where the rent stands — expected vs collected, and who to chase today.</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.lbl} className="bg-surface border border-default rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{t.lbl}</div>
            <div className="text-2xl font-bold text-primary mt-1.5 tabular-nums">{t.val}</div>
            <div className="text-xs text-secondary mt-0.5">{t.note}</div>
          </div>
        ))}
      </div>

      {/* Weekly expected vs collected */}
      <div className="bg-surface border border-default rounded-xl p-5">
        <h2 className="text-primary font-semibold text-[15px]">Expected vs collected, by week</h2>
        <p className="text-muted text-xs mt-0.5">Each rent week that has started. Recent weeks include rent not yet due.</p>
        <div className="flex items-end gap-2 h-44 mt-4">
          {weekly.map((w, i) => (
            <div key={i} className="flex-1 h-full relative group flex flex-col justify-end" title={`${fmtWk(w.week)} · ${inr(w.collected)} / ${inr(w.expected)}`}>
              <div className="absolute inset-x-0 bottom-0 rounded-t bg-inset" style={{ height: `${(w.expected / maxE) * 100}%` }} />
              <div className="absolute inset-x-0 bottom-0 rounded-t bg-accent-success" style={{ height: `${(w.collected / maxE) * 100}%` }} />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block whitespace-nowrap bg-base border border-default rounded-lg px-2.5 py-1.5 text-[11px] z-10 tabular-nums shadow-lg">
                <div className="text-muted">{fmtWk(w.week)}</div>
                <div className="text-secondary">Expected <span className="text-primary font-semibold">{inr(w.expected)}</span></div>
                <div className="text-accent-success-text">Collected <span className="font-semibold">{inr(w.collected)}</span></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-secondary">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent-success inline-block" />Collected</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-inset inline-block" />Expected (uncollected)</span>
          {weekly.length > 0 && <span className="ml-auto text-[11px] text-faint">{fmtWk(weekly[0].week)} – {fmtWk(weekly[weekly.length - 1].week)}</span>}
        </div>
      </div>

      {/* Aging */}
      <div className="bg-surface border border-default rounded-xl p-5">
        <h2 className="text-primary font-semibold text-[15px]">Outstanding rent, by how late it is</h2>
        <p className="text-muted text-xs mt-0.5">Click a bucket to filter the chase list below.</p>
        <div className="flex h-8 rounded-lg overflow-hidden mt-4 gap-0.5">
          {bsum.slice(1).map((b) => b.amount > 0 && (
            <div key={b.key} className={b.bar} style={{ flex: b.amount }} title={`${b.label}: ${inr(b.amount)}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {bsum.map((b) => (
            <button key={b.key} onClick={() => setBucket(bucket === b.key ? null : b.key)}
              className={`text-left border rounded-lg p-3 transition-colors ${bucket === b.key ? "border-accent-purple ring-1 ring-accent-purple" : "border-subtle hover:border-muted"}`}>
              <div className="text-xs text-secondary font-semibold flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${b.dot}`} />{b.label}</div>
              <div className="text-lg font-bold text-primary mt-1 tabular-nums">{b.key === "ok" ? `${b.riders} riders` : inr(b.amount)}</div>
              <div className="text-[11px] text-muted mt-0.5">{b.key === "ok" ? "nothing owed" : `${b.riders} rider${b.riders !== 1 ? "s" : ""} · ${owedTotal ? Math.round((b.amount / owedTotal) * 100) : 0}% of owed`}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chase list */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between">
          <h2 className="text-primary font-semibold text-[15px]">Chase list</h2>
          <span className="text-xs text-muted">
            {active ? `${active.label}: ${rows.length} rider${rows.length !== 1 ? "s" : ""} · ${inr(rows.reduce((s, r) => s + r.outstanding, 0))}` : `${owed.length} riders with a balance`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Allotment", "Days behind", "Outstanding", "Sheet note"].map((h) => (
                  <th key={h} className={`px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium ${h === "Days behind" || h === "Outstanding" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No riders in this bucket.</td></tr>
              ) : rows.map((r) => {
                const b = BUCKETS.find((x) => x.test(r.days_behind)) ?? BUCKETS[0];
                return (
                  <tr key={r.rider_id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.rider_id}`} className="text-primary font-medium hover:text-accent-purple hover:underline">{r.name}</Link>
                      <p className="text-muted text-xs">{r.rider_code}</p>
                    </td>
                    <td className="px-5 py-3 text-secondary text-xs">{r.allotment_code ?? "—"}</td>
                    <td className="px-5 py-3 text-right"><span className={`text-xs font-semibold tabular-nums ${b.cls}`}>{r.days_behind <= 0 ? "on track" : `${r.days_behind}d`}</span></td>
                    <td className="px-5 py-3 text-right text-primary font-semibold tabular-nums">{r.outstanding > 0 ? inr(r.outstanding) : "—"}</td>
                    <td className="px-5 py-3 text-secondary text-xs max-w-[240px] truncate" title={r.sheet_note ?? undefined}>{r.sheet_note ? `📝 ${r.sheet_note}` : <span className="text-faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
