"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { inr } from "@/lib/format";

type Claim = {
  id: string;
  amount: number;
  utr: string | null;
  screenshot_url: string;
  submitted_at: string;
  age_hours: number;
  rider_id: string;
  rider_name: string;
  rider_code: string | null;
  mobile: string;
  ev_number: string | null;
  outstanding_now: number;
};

// The rider-app payment verification queue. Approving runs the normal
// rent-received flow (credit folding, ledger row, UTR carried); rejecting
// requires a reason the rider will see in their app. Claims age visibly —
// this queue rotting breaks rider trust, so oldest first.
export default function PaymentClaimsQueue() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = () => {
    fetch("/api/payment-claims")
      .then((r) => r.json())
      .then((d) => setRows(d.claims ?? []));
  };
  useEffect(load, []);

  async function approve(c: Claim) {
    const ok = await confirm({
      title: "Approve this payment?",
      message: `${inr(c.amount)} from ${c.rider_name} will be recorded as received (Online${c.utr ? `, UTR ${c.utr}` : ""}) and their rent balance updated.`,
      confirmLabel: "Approve & record",
    });
    if (!ok) return;
    await act(c.id, { action: "approve" }, "Payment approved and recorded");
  }

  async function reject(c: Claim) {
    if (!reason.trim()) { toast.show("Enter the rejection reason first", "error"); return; }
    await act(c.id, { action: "reject", reason: reason.trim() }, "Claim rejected");
    setRejecting(null);
    setReason("");
  }

  async function act(id: string, body: object, okMsg: string) {
    setActingOn(id);
    try {
      const res = await fetch(`/api/payment-claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
        toast.show(okMsg, "success");
      } else {
        const msg = await res.json().catch(() => ({}));
        toast.show(msg.error || "Action failed", "error");
      }
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Payment Claims</h1>
        <p className="text-muted text-sm mt-1">
          Rider-app submissions — verify the screenshot against the bank/UPI statement, then approve to record. Oldest first; a stale queue means riders being chased for rent they already paid.
        </p>
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Claimed", "Outstanding", "UTR", "Proof", "Submitted", "Action"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No pending claims — queue is clear ✅</td></tr>
              ) : rows.map((c) => (
                <tr key={c.id} className="border-b border-subtle hover:bg-overlay-hover align-top">
                  <td className="px-5 py-3.5">
                    <Link href={`/riders/${c.rider_id}`} className="text-accent-purple hover:underline font-medium">{c.rider_name}</Link>
                    <p className="text-faint text-xs">{c.rider_code ?? "—"} · {c.mobile}{c.ev_number ? ` · ${c.ev_number}` : ""}</p>
                  </td>
                  <td className="px-5 py-3.5 text-accent-teal font-bold whitespace-nowrap">{inr(c.amount)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={c.outstanding_now > 0 ? "text-accent-danger-alt-text font-semibold" : "text-muted"}>{inr(c.outstanding_now)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs font-mono">{c.utr ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <a href={`/api/file?key=${encodeURIComponent(c.screenshot_url)}`} target="_blank" rel="noopener noreferrer"
                      className="text-accent-purple text-xs font-semibold hover:underline">View screenshot</a>
                  </td>
                  <td className="px-5 py-3.5 text-muted text-xs whitespace-nowrap">
                    {c.submitted_at}
                    <span className={`block text-[11px] font-semibold ${c.age_hours >= 4 ? "text-accent-danger-alt-text" : "text-faint"}`}>
                      {c.age_hours < 1 ? "just now" : `${c.age_hours}h waiting`}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {rejecting === c.id ? (
                      <div className="space-y-1.5 min-w-[180px]">
                        <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
                          placeholder="Reason (rider will see this)"
                          className="w-full bg-base border border-default rounded-lg px-2 py-1.5 text-primary text-xs focus:outline-none focus:border-accent-danger-alt" />
                        <div className="flex gap-2">
                          <button onClick={() => reject(c)} disabled={actingOn === c.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-accent-danger-alt/15 text-accent-danger-alt-text hover:bg-accent-danger-alt/25 disabled:opacity-50">Confirm reject</button>
                          <button onClick={() => { setRejecting(null); setReason(""); }} className="text-xs text-muted hover:text-primary">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => approve(c)} disabled={actingOn === c.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-success/15 text-accent-success-text hover:bg-accent-success/25 disabled:opacity-50 transition-colors">Approve</button>
                        <button onClick={() => { setRejecting(c.id); setReason(""); }} disabled={actingOn === c.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-danger-alt/15 text-accent-danger-alt-text hover:bg-accent-danger-alt/25 disabled:opacity-50 transition-colors">Reject</button>
                      </div>
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
