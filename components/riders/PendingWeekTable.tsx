"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RentMarkPaid from "./RentMarkPaid";
import { inr, dateIN } from "@/lib/format";

type PendingWeekRider = {
  id: string; rider_code: string; name: string; mobile: string; status: string;
  hub_id: string; hub_name: string;
  vehicle_id: string; vehicle_number: string;
  employer: string; rental_mode: string;
  next_due_date: string; last_due_date: string; days_behind: number;
  period_amount: number; amount_due: number;
};

export default function PendingWeekTable() {
  const [riders, setRiders] = useState<PendingWeekRider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRiders = async () => {
    setLoading(true);
    const res = await fetch("/api/riders?rent=pending_week");
    setRiders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRiders(); }, []);

  const totalPending = riders.reduce((sum, r) => sum + Math.round(r.period_amount ?? r.amount_due), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/riders" className="text-muted hover:text-secondary text-sm transition-colors">← Riders</Link>
            <span className="text-faint">/</span>
            <h1 className="text-primary text-2xl font-bold">Pending This Week</h1>
          </div>
          <p className="text-muted text-sm mt-1">
            {loading ? "Loading…" : `${riders.length} rider${riders.length !== 1 ? "s" : ""} whose current week's rent is unpaid · ${inr(totalPending)} to collect`}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["User ID", "Name", "Mobile", "Hub", "Vehicle", "Due Since", "Next Due", "This Week's Rent", "Action"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted">Loading…</td></tr>
              ) : riders.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted">No riders with the current week pending</td></tr>
              ) : riders.map((r) => {
                const weekRent = Math.round(r.period_amount ?? r.amount_due);
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
                    <td className="px-5 py-3 whitespace-nowrap">
                      {r.last_due_date ? (
                        <>
                          <span className="text-secondary">{dateIN(r.last_due_date, { day: "numeric", month: "short" })}</span>{" "}
                          <span className={`text-xs font-semibold ${r.days_behind >= 3 ? "text-accent-danger-alt-text" : r.days_behind >= 1 ? "text-accent-warning-text" : "text-muted"}`}>
                            ({Math.max(0, r.days_behind)} day{Math.max(0, r.days_behind) !== 1 ? "s" : ""})
                          </span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">
                      {r.next_due_date ? dateIN(r.next_due_date, { day: "numeric", month: "short" }) : "—"}
                    </td>
                    <td className="px-5 py-3 font-semibold text-accent-teal whitespace-nowrap">{inr(weekRent)}</td>
                    <td className="px-5 py-3">
                      <RentMarkPaid
                        riderId={r.id}
                        label="This week"
                        defaultAmount={weekRent}
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
