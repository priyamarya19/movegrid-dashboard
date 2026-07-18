"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DateRangeFilter, { RangeValue, rangeQuery } from "@/components/DateRangeFilter";
import { inr, dateIN } from "@/lib/format";

type Payment = {
  rider_id: string; rider_code: string; name: string;
  vehicle_id: string | null; ev_number: string | null;
  amount_collected: number; payment_mode: string | null;
  payment_date: string; period_start: string | null; period_end: string | null;
};

const dm = { day: "numeric", month: "short" } as const;

export default function PaymentsReceived() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RangeValue>({ range: "all", from: "", to: "" });

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/collections/payments${rangeQuery(filter)}`)
      .then((r) => r.json())
      .then((d) => { if (live) { setRows(d.payments ?? []); setTotal(d.total ?? 0); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">
          {loading ? "Loading…" : `${rows.length} collection${rows.length !== 1 ? "s" : ""} · `}
          {!loading && <span className="text-accent-teal font-semibold">{inr(Math.round(total))} collected</span>}
        </p>
        <DateRangeFilter value={filter} onChange={setFilter} />
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Date Received", "Rider", "Vehicle", "Amount", "Mode", "Period Covered"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No collections in this range</td></tr>
              ) : rows.map((p, i) => (
                <tr key={i} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(p.payment_date, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3">
                    <Link href={`/riders/${p.rider_id}`} className="text-primary font-medium hover:text-accent-purple hover:underline">{p.name}</Link>
                    <span className="text-muted text-xs ml-1.5">{p.rider_code}</span>
                  </td>
                  <td className="px-5 py-3">
                    {p.vehicle_id ? <Link href={`/vehicles/${p.vehicle_id}`} className="text-accent-purple hover:underline">{p.ev_number}</Link> : <span className="text-muted">{p.ev_number ?? "—"}</span>}
                  </td>
                  <td className="px-5 py-3 text-accent-teal font-semibold whitespace-nowrap">{inr(Math.round(Number(p.amount_collected)))}</td>
                  <td className="px-5 py-3 text-secondary">{p.payment_mode ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary whitespace-nowrap">
                    {p.period_start && p.period_end ? `${dateIN(p.period_start, dm)} – ${dateIN(p.period_end, dm)}` : "—"}
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
