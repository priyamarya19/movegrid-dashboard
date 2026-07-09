"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";

// Rider-level payment recording. Rolling-balance model: any amount just extends the
// rider's paid_through_date (amount ÷ daily_rate = days added) — a normal week's rent,
// a partial catch-up, and a multi-week advance top-up are all the same action.
export default function RecordPayment({ riderId, dailyRent }: { riderId: string; dailyRent: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<PaymentProofValue>(emptyProof);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const daysPreview = dailyRent && Number(amount) > 0 ? Math.floor(Number(amount) / dailyRent) : 0;

  async function submit() {
    if (!proofValid(proof)) { setError("Select a payment mode and upload the proof image"); return; }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) { setError("Enter a valid amount"); return; }
    setLoading(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/rent-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountNum, payment_mode: proof.mode, payment_utr: proof.utr || null, payment_screenshot_url: proof.proof,
      }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setOpen(false); setAmount(""); setProof(emptyProof);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-purple text-primary text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Record Payment
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-72 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Record rent payment</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Amount ₹</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 1680, or more for an advance"
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-purple" autoFocus />
          {daysPreview > 0 && (
            <p className="text-[11px] text-accent-teal mt-1">≈ {daysPreview} day{daysPreview !== 1 ? "s" : ""} of rent</p>
          )}
        </div>
        <PaymentProof value={proof} onChange={setProof} folder="rent-payments" />
        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={submit} disabled={loading || !amount || !proofValid(proof)}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-purple hover:bg-accent-purple text-primary disabled:opacity-50 transition-colors">
          {loading ? "Saving…" : "Record Payment"}
        </button>
      </div>
    </div>
  );
}
