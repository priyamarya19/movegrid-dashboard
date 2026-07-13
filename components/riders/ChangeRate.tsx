"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { istTodayISO } from "@/lib/date";

// Change the daily rate on an ACTIVE allotment without a full re-allotment — e.g. the
// rider switches km/usage plan on the same vehicle. The backend models it as a
// continuation (/api/allotments/[id]/change-rate): the tenancy stays one allotment,
// past weeks keep the old rate, weeks from the effective date bill the new rate.
export default function ChangeRate({ assignmentId, currentRate }: { assignmentId: string; currentRate: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate != null ? String(currentRate) : "");
  const [effectiveDate, setEffectiveDate] = useState(istTodayISO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const rateNum = Number(rate);
    if (!(rateNum > 0)) { setError("Enter a valid daily rate"); return; }
    setLoading(true); setError("");
    const res = await fetch(`/api/allotments/${assignmentId}/change-rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_rent: rateNum, effective_date: effectiveDate || null }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Failed to change rate"); return; }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); setRate(currentRate != null ? String(currentRate) : ""); }}
        className="inline-flex items-center gap-2 border border-default text-secondary hover:text-primary hover:border-strong text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Change rate
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-72 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Change daily rate</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">New daily rate ₹</label>
          <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 300"
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-warning" autoFocus />
          {currentRate != null && <p className="text-[11px] text-muted mt-1">Currently ₹{currentRate}/day</p>}
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Effective from</label>
          <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-warning" />
          <p className="text-[11px] text-muted mt-1">Weeks before this keep the old rate; from here on the new rate applies.</p>
        </div>
        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={submit} disabled={loading || !rate}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-warning hover:bg-accent-warning text-on-dark disabled:opacity-50 transition-colors">
          {loading ? "Saving…" : "Apply new rate"}
        </button>
      </div>
    </div>
  );
}
