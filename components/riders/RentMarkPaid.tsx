"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RentMarkPaid({
  riderId,
  periodStart,
  periodEnd,
  daysLeft,
  defaultAmount,
  onPaid,
}: {
  riderId: string;
  periodStart: string;
  periodEnd: string;
  daysLeft: number;
  defaultAmount?: number;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(defaultAmount ?? 1610));
  const [loading, setLoading] = useState(false);

  async function markPaid() {
    setLoading(true);
    await fetch(`/api/riders/${riderId}/rent-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), period_start: periodStart, period_end: periodEnd }),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
    onPaid?.();
  }

  const urgencyColor =
    daysLeft < 0 ? "text-red-400" : daysLeft <= 2 ? "text-[#fdcb6e]" : "text-[#aaa]";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1e1e2e] hover:bg-[#6C5CE7]/20 hover:text-[#6C5CE7] transition-colors whitespace-nowrap"
        style={{ color: daysLeft < 0 ? "#f87171" : daysLeft <= 2 ? "#fdcb6e" : "#666" }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {daysLeft < 0 ? `Overdue ${Math.abs(daysLeft)}d` : daysLeft === 0 ? "Due today" : `Due in ${daysLeft}d`}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#555] text-xs">₹</span>
      <input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        className="w-20 bg-[#0A0A0F] border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[#6C5CE7]"
        autoFocus
        onKeyDown={e => e.key === "Enter" && markPaid()}
      />
      <button
        onClick={markPaid}
        disabled={loading || !amount}
        className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#6C5CE7] hover:bg-[#7c6cf7] text-white disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {loading ? "…" : "Mark Paid"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-[#444] hover:text-[#aaa] text-xs transition-colors"
      >✕</button>
    </div>
  );
}
