"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";
import { dateIN, inr } from "@/lib/format";

type Debt = {
  id: string; source: "recovery" | "return"; original: number; collected_at_close: number;
  recovered_later: number; remaining: number; date: string; created_by: string | null;
  rider_id: string; rider_name: string; rider_code: string | null; mobile: string;
  vehicle_id: string | null; ev_number: string | null;
};

// Finance → Bad Debt: rent that left with a closed tenancy. "Mark payment"
// records money a defaulter pays later — remaining hits 0 → settled.
export default function BadDebtTab() {
  const toast = useToast();
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [totals, setTotals] = useState({ gross: 0, recovered: 0, outstanding: 0 });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<PaymentProofValue>(emptyProof);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/bad-debts")
      .then((r) => r.json())
      .then((d) => { setDebts(d.debts ?? []); setTotals(d.totals ?? { gross: 0, recovered: 0, outstanding: 0 }); });
  };
  useEffect(load, []);

  async function submitPayment(d: Debt) {
    if (!(Number(amount) > 0) || !proofValid(proof)) {
      toast.show("Enter amount, mode and proof", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/bad-debts/${d.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), payment_mode: proof.mode, payment_utr: proof.utr || null, proof_url: proof.proof }),
    });
    setSaving(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show(j.error || "Failed to record payment", "error"); return; }
    toast.show(`₹${Number(amount).toLocaleString("en-IN")} recorded against ${d.rider_name}'s dues`, "success");
    setPayingId(null); setAmount(""); setProof(emptyProof);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Gross bad debt", value: inr(totals.gross), color: "var(--accent-warning)" },
          { label: "Recovered later", value: inr(totals.recovered), color: "var(--accent-teal)" },
          { label: "Net outstanding", value: inr(totals.outstanding), color: "var(--accent-danger-alt)" },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Date", "Rider", "Vehicle", "Source", "Original", "Recovered since", "Remaining", "Action"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts === null ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : debts.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">No bad debt recorded — every closed tenancy settled in full.</td></tr>
              ) : debts.map((d) => (
                <tr key={d.id} className="border-b border-subtle align-top">
                  <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{dateIN(d.date, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3.5">
                    <Link href={`/riders/${d.rider_id}`} className="text-accent-purple hover:underline font-medium">{d.rider_name}</Link>
                    <p className="text-faint text-xs">{d.rider_code ?? "—"} · {d.mobile}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {d.vehicle_id ? <Link href={`/vehicles/${d.vehicle_id}`} className="text-accent-teal hover:underline">{d.ev_number}</Link> : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${d.source === "recovery" ? "bg-accent-danger-alt/15 text-accent-danger-alt-text" : "bg-accent-warning/15 text-accent-warning-text"}`}>
                      {d.source === "recovery" ? "Recovery" : "Return"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{inr(d.original)}</td>
                  <td className="px-5 py-3.5 text-accent-teal whitespace-nowrap">{d.recovered_later > 0 ? inr(d.recovered_later) : "—"}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {d.remaining > 0
                      ? <span className="text-accent-danger-alt-text font-bold">{inr(d.remaining)}</span>
                      : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-success/15 text-accent-success-text">Settled ✓</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {d.remaining <= 0 ? null : payingId === d.id ? (
                      <div className="space-y-2 min-w-[240px]">
                        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
                          placeholder={`Up to ₹${d.remaining.toLocaleString("en-IN")}`}
                          className="w-full bg-base border border-default rounded-lg px-2.5 py-1.5 text-primary text-xs focus:outline-none focus:border-accent-teal" />
                        <PaymentProof value={proof} onChange={setProof} folder="bad-debt-payments" />
                        <div className="flex gap-2">
                          <button onClick={() => submitPayment(d)} disabled={saving}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-teal text-on-dark disabled:opacity-50">
                            {saving ? "Saving…" : "Record"}
                          </button>
                          <button onClick={() => { setPayingId(null); setAmount(""); setProof(emptyProof); }} className="text-xs text-muted hover:text-primary">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setPayingId(d.id); setAmount(""); setProof(emptyProof); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25 transition-colors">
                        Mark payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
