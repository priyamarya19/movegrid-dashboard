"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-accent-danger-alt-text ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-purple-2 transition-colors";

const Section = ({ title }: { title: string }) => (
  <div className="col-span-full">
    <div className="flex items-center gap-3 mb-1">
      <div className="h-px flex-1 bg-default" />
      <span className="text-xs font-semibold uppercase tracking-widest text-accent-purple-2">{title}</span>
      <div className="h-px flex-1 bg-default" />
    </div>
  </div>
);

export default function InvestorForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "", mobile: "", email: "", password: "",
    aadhaar: "", pan: "", aadhaar_url: "",
    total_invested: "", investment_date: "",
    bank: "", account_number: "", confirm_account_number: "", ifsc: "",
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.account_number !== form.confirm_account_number) {
      setError("Account numbers do not match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          total_invested: form.total_invested ? Number(form.total_invested) : null,
          investment_date: form.investment_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add investor"); return; }
      router.push(`/investors/${data.id}`);
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Investor Details" />
        <Field label="Full Name" required><input className={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Investor's full name" required /></Field>
        <Field label="Mobile" required><input className={inp} value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="9876543210" required /></Field>
        <Field label="Email" required><input type="email" className={inp} value={form.email} onChange={e => set("email", e.target.value)} placeholder="investor@email.com" required /></Field>
        <Field label="Aadhaar"><input className={inp} value={form.aadhaar} onChange={e => set("aadhaar", e.target.value)} placeholder="12-digit Aadhaar" /></Field>
        <Field label="PAN"><input className={inp} value={form.pan} onChange={e => set("pan", e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></Field>
        <div className="sm:col-span-2 lg:col-span-1">
          <ImageUpload label="Aadhaar Image (front)" folder="investor-aadhaar" value={form.aadhaar_url} onChange={(key) => set("aadhaar_url", key)} />
        </div>

        <Section title="Investment" />
        <Field label="Investment Amount (₹)" required><input type="number" min="0" className={inp} value={form.total_invested} onChange={e => set("total_invested", e.target.value)} placeholder="250000" required /></Field>
        <Field label="Investment Date"><input type="date" className={inp} value={form.investment_date} onChange={e => set("investment_date", e.target.value)} /></Field>

        <Section title="Bank Account" />
        <Field label="Bank Name" required><input className={inp} value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="HDFC Bank" required /></Field>
        <Field label="Account Number" required><input className={inp} value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Account number" required /></Field>
        <Field label="Confirm Account Number" required><input className={inp} value={form.confirm_account_number} onChange={e => set("confirm_account_number", e.target.value)} placeholder="Re-enter account number" required /></Field>
        <Field label="IFSC Code" required><input className={inp} value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" required /></Field>

        <Section title="Login" />
        <Field label="Login Password" required><input type="text" className={inp} value={form.password} onChange={e => set("password", e.target.value)} placeholder="Min 8 characters" required /></Field>

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-accent-purple-2 hover:bg-accent-purple-2 text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Add Investor"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
