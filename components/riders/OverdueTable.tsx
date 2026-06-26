"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RentMarkPaid from "./RentMarkPaid";

const EXPECTED_RENT = 1610;

type OverdueRider = {
  id: string; rider_code: string; name: string; mobile: string; status: string;
  hub_id: string; hub_name: string;
  vehicle_id: string; vehicle_number: string;
  employer: string; rental_mode: string;
  last_due_date: string; period_days: number;
  partial_paid: number | null;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function daysOverdue(lastDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - new Date(lastDueDate).getTime()) / 86400000);
}

export default function OverdueTable() {
  const [riders, setRiders] = useState<OverdueRider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRiders = async () => {
    setLoading(true);
    const res = await fetch("/api/riders?rent=overdue");
    setRiders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRiders(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/riders" className="text-[#555] hover:text-[#aaa] text-sm transition-colors">← Riders</Link>
            <span className="text-[#333]">/</span>
            <h1 className="text-white text-2xl font-bold">Overdue Rent</h1>
          </div>
          <p className="text-[#666] text-sm mt-1">
            {loading ? "Loading…" : `${riders.length} rider${riders.length !== 1 ? "s" : ""} with unpaid overdue rent`}
          </p>
        </div>
      </div>

      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["User ID", "Name", "Mobile", "Hub", "Vehicle", "Overdue Since", "Days Overdue", "Partial Paid", "Action"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-[#555]">Loading…</td></tr>
              ) : riders.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-[#555]">No overdue riders</td></tr>
              ) : riders.map((r) => {
                const overdueDays = daysOverdue(r.last_due_date);
                const periodStart = addDays(r.last_due_date, -r.period_days);
                const partialAmt = r.partial_paid ? Number(r.partial_paid) : null;
                const balanceAmt = partialAmt != null ? EXPECTED_RENT - partialAmt : null;
                return (
                  <tr key={r.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.id}`} className="font-mono text-xs text-[#6C5CE7] font-semibold hover:underline">{r.rider_code ?? "—"}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline transition-colors">{r.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-[#aaa]">{r.mobile}</td>
                    <td className="px-5 py-3 text-[#aaa]">
                      {r.hub_id ? <Link href={`/hubs/${r.hub_id}`} className="hover:text-[#6C5CE7] hover:underline transition-colors">{r.hub_name}</Link> : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {r.vehicle_id ? <Link href={`/vehicles/${r.vehicle_id}`} className="text-[#6C5CE7] font-medium hover:underline">{r.vehicle_number}</Link> : <span className="text-[#555]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[#aaa] whitespace-nowrap">
                      {new Date(r.last_due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 whitespace-nowrap">
                        {overdueDays}d overdue
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {partialAmt != null ? (
                        <div className="text-xs leading-tight">
                          <span className="text-orange-400">₹{partialAmt.toLocaleString()} paid</span>
                          <span className="block text-red-400">₹{balanceAmt!.toLocaleString()} due</span>
                        </div>
                      ) : (
                        <span className="text-[#555] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <RentMarkPaid
                        riderId={r.id}
                        periodStart={periodStart}
                        periodEnd={r.last_due_date}
                        daysLeft={-overdueDays}
                        defaultAmount={balanceAmt ?? undefined}
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
