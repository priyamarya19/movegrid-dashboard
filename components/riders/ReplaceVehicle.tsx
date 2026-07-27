"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";

type ReadyVehicle = { id: string; ev_number: string; model_name?: string | null };

// One-step vehicle replacement on an active tenancy — replaces the old
// return + re-allot dance. The tenancy (allotment code, paid-through, credit,
// week numbering) carries over untouched. An optional payment section routes
// through the normal rent-received flow so cash taken at the swap always lands
// in the ledger.
export default function ReplaceVehicle({ riderId, currentEv, dailyRent }: { riderId: string; currentEv: string; dailyRent: number | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<ReadyVehicle[] | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [reason, setReason] = useState("");
  const [nfd, setNfd] = useState("");
  const [oldStatus, setOldStatus] = useState("under_maintenance");
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<PaymentProofValue>(emptyProof);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || vehicles !== null) return;
    fetch("/api/vehicles?status=ready_to_deploy")
      .then((r) => r.json())
      .then((d) => setVehicles(Array.isArray(d) ? d : d.vehicles ?? []))
      .catch(() => setVehicles([]));
  }, [open, vehicles]);

  const collecting = amount.trim() !== "";

  async function submit() {
    if (!vehicleId) { setError("Pick the replacement vehicle"); return; }
    if (!reason.trim()) { setError("A reason is required"); return; }
    if (collecting && (!(Number(amount) > 0) || !proofValid(proof))) {
      setError("For the payment, enter a valid amount, mode and proof — or clear the amount");
      return;
    }
    setLoading(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/replace-vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        new_vehicle_id: vehicleId, reason: reason.trim(),
        non_functional_days: nfd ? Number(nfd) : 0, old_vehicle_status: oldStatus,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      setError((await res.json().catch(() => ({}))).error || "Replacement failed");
      return;
    }
    // Vehicle swapped — record the optional payment through the normal flow.
    let payWarning = "";
    if (collecting) {
      const pay = await fetch(`/api/riders/${riderId}/rent-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), payment_mode: proof.mode, payment_utr: proof.utr || null, payment_screenshot_url: proof.proof }),
      });
      if (!pay.ok) payWarning = (await pay.json().catch(() => ({}))).error || "payment failed";
    }
    setLoading(false);
    setOpen(false);
    setVehicleId(""); setReason(""); setNfd(""); setAmount(""); setProof(emptyProof); setVehicles(null);
    if (payWarning) toast.show(`Vehicle replaced, but the payment didn't record (${payWarning}) — record it from Record Payment`, "error");
    else toast.show("Vehicle replaced" + (collecting ? " and payment recorded" : ""), "success");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="inline-flex items-center gap-2 border border-default hover:border-accent-teal text-secondary hover:text-accent-teal text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Replace Vehicle
      </button>
    );
  }

  const inp = "w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-teal";
  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-96 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Replace {currentEv}</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>

        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Replacement vehicle</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inp}>
            <option value="">{vehicles === null ? "Loading…" : vehicles.length === 0 ? "No ready vehicles" : "Select a vehicle"}</option>
            {(vehicles ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.ev_number}{v.model_name ? ` · ${v.model_name}` : ""}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Why is the vehicle being replaced?" className={`${inp} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Non-functional days</label>
            <input type="number" min="0" value={nfd} onChange={(e) => setNfd(e.target.value)} placeholder="0" className={inp} />
            <p className="text-[10px] text-faint mt-0.5">&gt; 0 raises a rent-waiver request</p>
          </div>
          <div>
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Old vehicle goes to</label>
            <select value={oldStatus} onChange={(e) => setOldStatus(e.target.value)} className={inp}>
              <option value="under_maintenance">Under maintenance</option>
              <option value="returned">Returned (inspection)</option>
              <option value="ready_to_deploy">Ready to deploy</option>
            </select>
          </div>
        </div>

        <div className="border-t border-default pt-3">
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Collect payment now (optional) ₹</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Leave empty if no money is being taken" className={inp} />
          {collecting && dailyRent && Number(amount) > 0 && (
            <p className="text-[11px] text-accent-teal mt-1">≈ {Math.floor(Number(amount) / dailyRent)} day{Math.floor(Number(amount) / dailyRent) !== 1 ? "s" : ""} of rent</p>
          )}
          {collecting && <div className="mt-2"><PaymentProof value={proof} onChange={setProof} folder="rent-payments" /></div>}
        </div>

        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={submit} disabled={loading || !vehicleId || !reason.trim()}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-teal text-on-dark disabled:opacity-50 transition-colors">
          {loading ? "Replacing…" : "Replace Vehicle"}
        </button>
        <p className="text-[10px] text-muted">Same allotment ID and rent cycle — no onboarding fee, no re-allotment.</p>
      </div>
    </div>
  );
}
