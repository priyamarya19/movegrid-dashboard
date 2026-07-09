"use client";

import { useState } from "react";

type Props = {
  vehicleId: string;
  riderName: string | null;
  maskedMobile: string;
};

export default function RevealNumberButton({ vehicleId, riderName, maskedMobile }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!maskedMobile) return <span className="text-muted text-xs">—</span>;

  function close() {
    setOpen(false);
    setReason("");
    setError("");
    setDone(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError("Please enter a reason"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/portfolio/reveal-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      setDone(true);
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <span className="text-secondary tabular-nums">{maskedMobile}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Request full number"
          className="text-muted hover:text-accent-teal transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div className="relative bg-surface border border-default rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-default flex items-center justify-between">
              <h2 className="text-primary font-semibold">Request full number</h2>
              <button onClick={close} className="text-muted hover:text-primary">✕</button>
            </div>

            {done ? (
              <div className="p-5 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent-success/20 text-accent-success-text">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-primary text-sm">Request submitted.</p>
                <p className="text-muted text-xs">The MoveGrid team has been notified and will get back to you.</p>
                <button onClick={close} className="mt-1 px-4 py-2 rounded-lg border border-default text-secondary hover:text-primary text-sm">Close</button>
              </div>
            ) : (
              <form onSubmit={submit} className="p-5 space-y-3">
                <p className="text-muted text-xs">
                  Requesting the full contact number{riderName ? ` for ${riderName}` : ""}. Your request and reason will be sent to the MoveGrid team.
                </p>
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Reason for knowing the full number <span className="text-accent-danger-alt-text">*</span></label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Why do you need to contact this rider?"
                    className="w-full bg-base border border-default rounded-xl px-3 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-teal resize-none"
                    required
                  />
                </div>
                {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-accent-teal hover:bg-accent-teal text-on-dark text-sm font-semibold disabled:opacity-60 transition-colors">
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                  <button type="button" onClick={close}
                    className="px-4 py-2 rounded-lg border border-default text-muted hover:text-primary text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
