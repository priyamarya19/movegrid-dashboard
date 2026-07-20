"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

// Manually apply for a rent waiver on the rider's active assignment. The waiver
// can be entered as days (fractional allowed — 1.5) or as an ₹ amount converted
// at the daily rate; either way it lands in the pending approval queue.
export default function ApplyWaiver({ riderId, dailyRent }: { riderId: string; dailyRent: number | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"days" | "amount">("days");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const num = Number(value);
  const preview = !(num > 0) || !dailyRent ? null
    : mode === "days"
      ? `≈ ₹${Math.round(num * dailyRent).toLocaleString("en-IN")} of rent waived`
      : `≈ ${(Math.round((num / dailyRent) * 100) / 100).toLocaleString("en-IN")} day${num / dailyRent !== 1 ? "s" : ""} of rent`;

  async function submit() {
    if (!(num > 0)) { setError("Enter a valid value"); return; }
    if (!reason.trim()) { setError("A reason is required"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/rent-waivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rider_id: riderId,
        days: mode === "days" ? num : undefined,
        amount: mode === "amount" ? num : undefined,
        reason: reason.trim(),
      }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Failed"); return; }
    setOpen(false); setValue(""); setReason("");
    toast.show("Waiver request submitted for approval", "success");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="inline-flex items-center gap-2 border border-default hover:border-accent-purple text-secondary hover:text-accent-purple text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Apply Waiver
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-80 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Apply for rent waiver</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-default text-xs font-semibold">
          {(["days", "amount"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 px-3 py-1.5 transition-colors ${mode === m ? "bg-accent-purple text-on-dark" : "bg-base text-muted hover:text-secondary"}`}>
              {m === "days" ? "Days" : "₹ Amount"}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">
            {mode === "days" ? "Days to waive" : "Amount to waive ₹"}
          </label>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
            min="0" step={mode === "days" ? "0.5" : "1"}
            placeholder={mode === "days" ? "e.g. 1.5" : "e.g. 360"}
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-purple" autoFocus />
          {preview && <p className="text-[11px] text-accent-teal mt-1">{preview}</p>}
        </div>

        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Why is this rent being waived?"
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-purple resize-none" />
        </div>

        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={submit} disabled={loading || !value || !reason.trim()}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-purple hover:bg-accent-purple text-on-dark disabled:opacity-50 transition-colors">
          {loading ? "Submitting…" : "Submit for approval"}
        </button>
        <p className="text-[10px] text-muted">Needs approval on the Rent Waivers page before it credits the rider.</p>
      </div>
    </div>
  );
}
