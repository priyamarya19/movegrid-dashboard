"use client";

import { useState } from "react";

/**
 * The "an admin has to say yes" step.
 *
 * Ops press the action, this asks the server to email a code to the admins,
 * and ops type in whatever the admin reads back to them. On success it hands
 * the caller an approval id to send with the real request.
 *
 * Written as a hook rather than a wrapper component so each screen keeps its
 * own layout — the allotment form and the rider edit form look nothing alike.
 */
export function useApprovalGate() {
  const [pending, setPending] = useState<null | { id: string; summary: string; sentTo: string[] }>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** Ask for a code. `parts` must be the exact values the server will re-derive. */
  async function request(args: {
    action: "rider_edit" | "allotment_start_date";
    summary: string;
    parts: Record<string, unknown>;
    subjectId?: string;
  }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: args.action, summary: args.summary, parts: args.parts, subject_id: args.subjectId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Could not send the code"); return false; }
      setPending({ id: j.id, summary: args.summary, sentTo: j.sent_to ?? [] });
      return true;
    } finally {
      setBusy(false);
    }
  }

  /** Returns the approval id once the code checks out, else null. */
  async function confirm(): Promise<string | null> {
    if (!pending) return null;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/approvals/${pending.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "That code is not right"); return null; }
      return pending.id;
    } finally {
      setBusy(false);
    }
  }

  function reset() { setPending(null); setCode(""); setError(""); }

  return { pending, code, setCode, busy, error, setError, request, confirm, reset };
}

/** The panel itself. Render it when `gate.pending` is set. */
export function ApprovalPanel({
  gate, onApproved, actionLabel = "Save",
}: {
  gate: ReturnType<typeof useApprovalGate>;
  onApproved: (approvalId: string) => void;
  actionLabel?: string;
}) {
  if (!gate.pending) return null;
  return (
    <div className="border border-accent-warning/40 bg-accent-warning/8 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-primary text-sm font-semibold">An admin needs to approve this</p>
        <p className="text-muted text-xs mt-1">{gate.pending.summary}</p>
        <p className="text-muted text-xs mt-1">
          A code has been emailed to {gate.pending.sentTo.join(", ") || "the approvers"}. Ask them to read it to you.
        </p>
      </div>
      <div className="flex gap-2 items-start">
        <input
          value={gate.code}
          onChange={(e) => gate.setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit code"
          inputMode="numeric"
          className="w-36 bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm font-mono tracking-widest focus:outline-none focus:border-accent-purple"
        />
        <button
          type="button"
          disabled={gate.busy || gate.code.length < 6}
          onClick={async () => { const id = await gate.confirm(); if (id) onApproved(id); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-purple text-on-dark disabled:opacity-50"
        >
          {gate.busy ? "Checking…" : actionLabel}
        </button>
        <button type="button" onClick={gate.reset} className="px-3 py-2 text-xs text-muted hover:text-primary">
          Cancel
        </button>
      </div>
      {gate.error ? <p className="text-accent-danger-alt-text text-xs">{gate.error}</p> : null}
    </div>
  );
}
