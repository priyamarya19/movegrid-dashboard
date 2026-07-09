"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bank: string | null;
  ifsc: string | null;
  accountNumber: string | null;
  bankStatus: string;
};

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-purple-2 transition-colors disabled:opacity-60";

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent-warning/20 text-accent-warning-text">
        Verification in progress
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent-success/20 text-accent-success-text">
      Verified
    </span>
  );
}

export default function BankDetailsForm({ bank, ifsc, accountNumber, bankStatus }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    bank: bank ?? "",
    ifsc: ifsc ?? "",
    account_number: accountNumber ?? "",
    confirm_account_number: "",
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function cancel() {
    setForm({ bank: bank ?? "", ifsc: ifsc ?? "", account_number: accountNumber ?? "", confirm_account_number: "" });
    setError("");
    setEditing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.account_number !== form.confirm_account_number) {
      setError("Account numbers do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/investors/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to update bank details"); return; }
      setEditing(false);
      router.refresh();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-surface border border-default rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-primary font-semibold">Bank Details</h2>
        <StatusBadge status={bankStatus} />
      </div>

      {bankStatus === "pending" && (
        <p className="text-accent-warning-text/80 text-xs mb-4">
          Your updated bank details are awaiting verification by the MoveGrid team.
        </p>
      )}

      {!editing ? (
        <>
          {[
            { label: "Bank Name", value: bank ?? "—" },
            { label: "Account Number", value: accountNumber ?? "—" },
            { label: "IFSC Code", value: ifsc ?? "—" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between py-2 border-b border-default">
              <span className="text-muted text-sm">{row.label}</span>
              <span className="text-secondary text-sm">{row.value}</span>
            </div>
          ))}
          <button
            onClick={() => setEditing(true)}
            className="mt-4 px-4 py-2 rounded-xl border border-default text-secondary hover:text-primary hover:border-strong text-sm transition-colors"
          >
            Edit bank details
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Bank Name</label>
            <input className={inp} value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="HDFC Bank" required />
          </div>
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Account Number</label>
            <input className={inp} value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Account number" required />
          </div>
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Confirm Account Number</label>
            <input className={inp} value={form.confirm_account_number} onChange={e => set("confirm_account_number", e.target.value)} placeholder="Re-enter account number" required />
          </div>
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">IFSC Code</label>
            <input className={inp} value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" required />
          </div>

          {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={submitting}
              className="px-5 py-2 rounded-xl bg-accent-purple-2 hover:bg-accent-purple-2 text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
              {submitting ? "Saving..." : "Save changes"}
            </button>
            <button type="button" onClick={cancel}
              className="px-4 py-2 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-muted text-xs">Changes will be marked pending until verified by the MoveGrid team.</p>
        </form>
      )}
    </div>
  );
}
