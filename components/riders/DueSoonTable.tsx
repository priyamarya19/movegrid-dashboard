"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RentMarkPaid from "./RentMarkPaid";
import { dateIN } from "@/lib/format";

type DueSoonRider = {
  id: string; rider_code: string; name: string; mobile: string; status: string;
  hub_id: string; hub_name: string;
  vehicle_id: string; vehicle_number: string;
  employer: string; rental_mode: string;
  next_due_date: string; amount_due: number;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

export default function DueSoonTable() {
  const [riders, setRiders] = useState<DueSoonRider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRiders = async () => {
    setLoading(true);
    const res = await fetch("/api/riders?rent=due_soon");
    setRiders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRiders(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/riders" className="text-muted hover:text-secondary text-sm transition-colors">← Riders</Link>
            <span className="text-faint">/</span>
            <h1 className="text-primary text-2xl font-bold">Due in 2 Days</h1>
          </div>
          <p className="text-muted text-sm mt-1">
            {loading ? "Loading…" : `${riders.length} rider${riders.length !== 1 ? "s" : ""} with rent due today or within 2 days`}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["User ID", "Name", "Mobile", "Hub", "Vehicle", "Due Date", "Days Left", "Action"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
              ) : riders.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">No riders due in the next 2 days</td></tr>
              ) : riders.map((r) => {
                const left = daysUntil(r.next_due_date);
                const urgencyColor = left === 0 ? "bg-accent-warning/15 text-accent-warning" : "bg-secondary/10 text-secondary";
                const urgencyLabel = left === 0 ? "Due today" : `${left}d left`;
                return (
                  <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.id}`} className="font-mono text-xs text-accent-purple font-semibold hover:underline">{r.rider_code ?? "—"}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.id}`} className="text-primary font-medium hover:text-accent-purple hover:underline transition-colors">{r.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-secondary">{r.mobile}</td>
                    <td className="px-5 py-3 text-secondary">
                      {r.hub_id ? <Link href={`/hubs/${r.hub_id}`} className="hover:text-accent-purple hover:underline transition-colors">{r.hub_name}</Link> : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {r.vehicle_id ? <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-purple font-medium hover:underline">{r.vehicle_number}</Link> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">
                      {dateIN(r.next_due_date, { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${urgencyColor}`}>
                        {urgencyLabel}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <RentMarkPaid
                        riderId={r.id}
                        label={urgencyLabel}
                        urgent={left === 0}
                        defaultAmount={Math.round(r.amount_due)}
                        onPaid={fetchRiders}
                      />
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
