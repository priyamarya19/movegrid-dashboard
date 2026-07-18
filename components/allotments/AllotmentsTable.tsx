"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DateRangeFilter, { RangeValue, rangeQuery } from "@/components/DateRangeFilter";
import { dateIN } from "@/lib/format";

type Row = {
  rider_id: string; rider_code: string;
  vehicle_id: string; ev_number: string;
  assigned_date: string; week_start: string; week_end: string;
  allotted_by: string | null; days_behind: number;
};

function rentStatus(daysBehind: number): { label: string; cls: string } {
  if (daysBehind <= 0) return { label: "Paid", cls: "bg-accent-success/20 text-accent-success-text" };
  if (daysBehind <= 7) return { label: "Pending this week", cls: "bg-accent-warning/20 text-accent-warning-text" };
  return { label: "Overdue", cls: "bg-accent-danger-alt/20 text-accent-danger-alt-text" };
}

const dm = { day: "numeric", month: "short" } as const;

export default function AllotmentsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RangeValue>({ range: "all", from: "", to: "" });

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/allotments${rangeQuery(filter)}`)
      .then((r) => r.json())
      .then((d) => { if (live) { setRows(d.allotments ?? []); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-primary text-2xl font-bold">Allotments</h1>
          <p className="text-muted text-sm mt-1">{loading ? "Loading…" : `${rows.length} active allotment${rows.length !== 1 ? "s" : ""}`}</p>
        </div>
        <DateRangeFilter value={filter} onChange={setFilter} />
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Vehicle", "Allotted On", "Rent Week", "Allotted By", "Rent Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No active allotments in this range</td></tr>
              ) : rows.map((r, i) => {
                const st = rentStatus(r.days_behind);
                return (
                  <tr key={i} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.rider_id}`} className="font-mono text-xs text-accent-purple font-semibold hover:underline">{r.rider_code ?? "—"}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-purple font-medium hover:underline">{r.ev_number}</Link>
                    </td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(r.assigned_date, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(r.week_start, dm)} – {dateIN(r.week_end, dm)}</td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{r.allotted_by ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                    </td>
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
