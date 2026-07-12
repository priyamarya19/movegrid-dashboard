"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";

export default function RentMarkPaid({
  riderId,
  label,
  urgent = false,
  defaultAmount,
  onPaid,
}: {
  riderId: string;
  label: string;
  urgent?: boolean;
  defaultAmount?: number;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(defaultAmount ?? ""));
  const [proof, setProof] = useState<PaymentProofValue>(emptyProof);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function markPaid() {
    if (!proofValid(proof)) { setError("Select a payment mode and upload the proof image"); return; }
    setLoading(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/rent-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        payment_mode: proof.mode, payment_utr: proof.utr || null, payment_screenshot_url: proof.proof,
      }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setOpen(false); setProof(emptyProof);
    router.refresh();
    onPaid?.();
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-default hover:bg-accent-purple/20 hover:text-accent-purple transition-colors whitespace-nowrap"
        style={{ color: urgent ? "var(--accent-danger-alt-text)" : "var(--accent-warning-text)" }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {label}
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-64 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Record rent payment</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Amount ₹</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-purple" autoFocus />
        </div>
        <PaymentProof value={proof} onChange={setProof} folder="rent-payments" />
        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={markPaid} disabled={loading || !amount || !proofValid(proof)}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-purple hover:bg-accent-purple text-on-dark disabled:opacity-50 transition-colors">
          {loading ? "Saving…" : "Mark Paid"}
        </button>
      </div>
    </div>
  );
}
