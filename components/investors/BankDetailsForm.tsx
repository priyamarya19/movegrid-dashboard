"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bank: string | null;
  ifsc: string | null;
  accountNumber: string | null;
  bankStatus: string;
};

const inp = "w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#a29bfe] transition-colors disabled:opacity-60";

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
        Verification in progress
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
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
    <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">Bank Details</h2>
        <StatusBadge status={bankStatus} />
      </div>

      {bankStatus === "pending" && (
        <p className="text-yellow-400/80 text-xs mb-4">
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
            <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e]">
              <span className="text-[#555] text-sm">{row.label}</span>
              <span className="text-[#ccc] text-sm">{row.value}</span>
            </div>
          ))}
          <button
            onClick={() => setEditing(true)}
            className="mt-4 px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            Edit bank details
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">Bank Name</label>
            <input className={inp} value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="HDFC Bank" required />
          </div>
          <div>
            <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">Account Number</label>
            <input className={inp} value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Account number" required />
          </div>
          <div>
            <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">Confirm Account Number</label>
            <input className={inp} value={form.confirm_account_number} onChange={e => set("confirm_account_number", e.target.value)} placeholder="Re-enter account number" required />
          </div>
          <div>
            <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">IFSC Code</label>
            <input className={inp} value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" required />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#a29bfe] hover:bg-[#b3aeff] text-white text-sm font-semibold disabled:opacity-60 transition-colors">
              {submitting ? "Saving..." : "Save changes"}
            </button>
            <button type="button" onClick={cancel}
              className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-[#555] text-xs">Changes will be marked pending until verified by the MoveGrid team.</p>
        </form>
      )}
    </div>
  );
}
