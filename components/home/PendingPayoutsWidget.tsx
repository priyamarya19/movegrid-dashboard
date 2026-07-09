"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Payout = {
  id: string;
  investor_name: string;
  ev_number: string | null;
  amount: number;
  due_date: string;
};

const fmt = (n: number) => {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + n;
};

export default function PendingPayoutsWidget({ initialPayouts }: { initialPayouts: Payout[] }) {
  const router = useRouter();
  const [payouts, setPayouts] = useState<Payout[]>(initialPayouts);
  const [loading, setLoading] = useState<string | null>(null);

  async function markPaid(payoutId: string) {
    setLoading(payoutId);
    const res = await fetch("/api/investors/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payout_id: payoutId }),
    });
    setLoading(null);
    if (res.ok) {
      setPayouts((prev) => prev.filter((p) => p.id !== payoutId));
      router.refresh();
    }
  }

  if (payouts.length === 0) {
    return (
      <div className="bg-surface border border-default rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-primary">Pending Investor Payouts</p>
          <Link href="/investors" className="text-xs text-accent-purple hover:underline">View all →</Link>
        </div>
        <p className="text-muted text-sm py-4 text-center">No pending payouts</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-default flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">Pending Investor Payouts</p>
        <Link href="/investors" className="text-xs text-accent-purple hover:underline">View all →</Link>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-default">
            {["Investor", "Vehicle", "Amount", "Due Date", "Action"].map(h => (
              <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id} className="border-b border-subtle hover:bg-overlay-hover">
              <td className="px-5 py-3 text-primary font-medium">{p.investor_name}</td>
              <td className="px-5 py-3 text-accent-purple">{p.ev_number ?? "—"}</td>
              <td className="px-5 py-3 text-accent-teal font-semibold">{fmt(Number(p.amount))}</td>
              <td className="px-5 py-3 text-secondary whitespace-nowrap">
                {new Date(p.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </td>
              <td className="px-5 py-3">
                <button
                  onClick={() => markPaid(p.id)}
                  disabled={loading === p.id}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {loading === p.id ? "…" : "Mark Paid"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
