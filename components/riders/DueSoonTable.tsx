"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RentMarkPaid from "./RentMarkPaid";

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
            <Link href="/riders" className="text-[#555] hover:text-[#aaa] text-sm transition-colors">← Riders</Link>
            <span className="text-[#333]">/</span>
            <h1 className="text-white text-2xl font-bold">Due in 2 Days</h1>
          </div>
          <p className="text-[#666] text-sm mt-1">
            {loading ? "Loading…" : `${riders.length} rider${riders.length !== 1 ? "s" : ""} with rent due today or within 2 days`}
          </p>
        </div>
      </div>

      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["User ID", "Name", "Mobile", "Hub", "Vehicle", "Due Date", "Days Left", "Action"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[#555]">Loading…</td></tr>
              ) : riders.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[#555]">No riders due in the next 2 days</td></tr>
              ) : riders.map((r) => {
                const left = daysUntil(r.next_due_date);
                const urgencyColor = left === 0 ? "bg-[#fdcb6e]/15 text-[#fdcb6e]" : "bg-[#aaa]/10 text-[#aaa]";
                const urgencyLabel = left === 0 ? "Due today" : `${left}d left`;
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
                      {new Date(r.next_due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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
