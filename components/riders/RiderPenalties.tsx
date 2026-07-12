"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";
import { useConfirm } from "@/components/Confirm";

type Penalty = {
  id: string; amount: number | null; detail: string | null; status: string;
  created_by: string | null; created_at: string; ev_number: string | null;
  payment_mode: string | null; payment_utr: string | null; payment_proof_url: string | null;
};

export default function RiderPenalties({ riderId }: { riderId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Penalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  // mark-paid state
  const [payId, setPayId] = useState<string | null>(null);
  const [proof, setProof] = useState<PaymentProofValue>(emptyProof);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/riders/${riderId}/penalties`);
    if (res.ok) setRows((await res.json()).penalties);
    setLoading(false);
  }, [riderId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!detail && !amount) { setError("Enter a detail or amount"); return; }
    setAdding(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/penalties`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: detail || null, amount: amount || null }),
    });
    setAdding(false);
    if (!res.ok) { setError((await res.json()).error || "Failed to add"); return; }
    setDetail(""); setAmount(""); setOpen(false); load();
  }

  async function markPaid(penaltyId: string) {
    if (!proofValid(proof)) { setError("Select a payment mode and upload the proof image"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/penalties`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ penalty_id: penaltyId, action: "pay", payment_mode: proof.mode, payment_utr: proof.utr || null, payment_proof_url: proof.proof }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setPayId(null); setProof(emptyProof); load();
  }

  async function waive(penaltyId: string) {
    if (!(await confirm({ title: "Waive this penalty?", message: "The penalty amount will be written off.", confirmLabel: "Waive" }))) return;
    await fetch(`/api/riders/${riderId}/penalties`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ penalty_id: penaltyId, action: "waive" }),
    });
    load();
  }

  const outstanding = rows.filter(r => r.status === "pending").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const fmtD = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const badge = (s: string) => s === "waived" ? "bg-default text-muted" : s === "paid" ? "bg-accent-success/15 text-accent-success-text" : "bg-accent-warning/15 text-accent-warning-text";

  return (
    <div className="bg-surface border border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-default flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-primary font-semibold">Penalties</h2>
          {outstanding > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-danger-alt/15 text-accent-danger-alt-text font-semibold">
              ₹{outstanding.toLocaleString("en-IN")} outstanding
            </span>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-danger/13 text-accent-danger hover:bg-accent-danger/19 transition-colors">
          {open ? "Cancel" : "+ Add penalty"}
        </button>
      </div>

      {open && (
        <div className="px-5 py-4 border-b border-default bg-inset flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Detail</label>
            <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="e.g. Front fender, handle T band"
              className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-danger" />
          </div>
          <div className="w-28">
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-danger" />
          </div>
          <button onClick={add} disabled={adding}
            className="px-4 py-2 rounded-lg bg-accent-danger hover:bg-accent-danger text-primary text-sm font-semibold disabled:opacity-60">
            {adding ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="px-5 pt-3 text-accent-danger-alt-text text-xs">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default">
              {["Detail", "Amount", "Vehicle", "Status", "Added by", "Date", ""].map((h, i) => (
                <th key={i} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No penalties</td></tr>
            ) : rows.map(p => (
              <Fragment key={p.id}>
                <tr className="border-b border-subtle">
                  <td className="px-5 py-3 text-secondary">{p.detail ?? "—"}</td>
                  <td className="px-5 py-3 text-primary whitespace-nowrap">{p.amount != null ? `₹${Number(p.amount).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-5 py-3 text-secondary">{p.ev_number ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge(p.status)}`}>{p.status}</span>
                    {p.status === "paid" && p.payment_proof_url && (
                      <a href={`/api/file?key=${encodeURIComponent(p.payment_proof_url)}`} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-[11px] text-accent-purple hover:underline">proof{p.payment_mode ? ` · ${p.payment_mode}` : ""}</a>
                    )}
                  </td>
                  <td className="px-5 py-3 text-secondary">{p.created_by ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary whitespace-nowrap">{fmtD(p.created_at)}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    {p.status === "pending" && (
                      <>
                        <button onClick={() => { setPayId(payId === p.id ? null : p.id); setProof(emptyProof); setError(""); }}
                          className="text-[11px] font-semibold text-accent-success-text hover:underline">Mark paid</button>
                        <button onClick={() => waive(p.id)} className="ml-3 text-[11px] text-muted hover:text-secondary">Waive</button>
                      </>
                    )}
                  </td>
                </tr>
                {payId === p.id && (
                  <tr className="border-b border-subtle bg-inset">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="max-w-sm space-y-3">
                        <p className="text-xs text-muted">Record payment for this penalty — proof image is required.</p>
                        <PaymentProof value={proof} onChange={setProof} folder="penalties" />
                        <button onClick={() => markPaid(p.id)} disabled={busy || !proofValid(proof)}
                          className="px-4 py-2 rounded-lg bg-accent-success hover:bg-accent-success text-primary text-sm font-semibold disabled:opacity-50">
                          {busy ? "Saving…" : "Confirm paid"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
