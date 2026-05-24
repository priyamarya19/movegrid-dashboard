"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#a29bfe] transition-colors";

export default function HubForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    hub_name: "", city: "", area: "", vehicle_capacity: "",
    owner_name: "", owner_mobile: "",
    security_deposit: "", monthly_rent: "", agreement_pdf_url: "",
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vehicle_capacity: form.vehicle_capacity ? Number(form.vehicle_capacity) : null,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
          monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
          agreement_pdf_url: form.agreement_pdf_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create hub"); return; }
      router.push(`/hubs/${data.id}`);
    } finally { setSubmitting(false); }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-[#1e1e2e]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[#a29bfe]">{title}</span>
        <div className="h-px flex-1 bg-[#1e1e2e]" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Hub Details" />
        <Field label="Hub Name" required><input className={inp} value={form.hub_name} onChange={e => set("hub_name", e.target.value)} placeholder="Sector 18 Hub" required /></Field>
        <Field label="City" required><input className={inp} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Noida" required /></Field>
        <Field label="Area / Locality"><input className={inp} value={form.area} onChange={e => set("area", e.target.value)} placeholder="Sector 18" /></Field>
        <Field label="Vehicle Capacity"><input type="number" className={inp} value={form.vehicle_capacity} onChange={e => set("vehicle_capacity", e.target.value)} placeholder="20" /></Field>

        <Section title="Owner / Landlord" />
        <Field label="Owner Name"><input className={inp} value={form.owner_name} onChange={e => set("owner_name", e.target.value)} placeholder="Owner's full name" /></Field>
        <Field label="Owner Mobile"><input className={inp} value={form.owner_mobile} onChange={e => set("owner_mobile", e.target.value)} placeholder="+91 9876543210" /></Field>

        <Section title="Financial Terms" />
        <Field label="Monthly Rent (₹)"><input type="number" className={inp} value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)} placeholder="0" /></Field>
        <Field label="Security Deposit (₹)"><input type="number" className={inp} value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="0" /></Field>
        <Field label="Agreement PDF (URL)"><input className={inp} value={form.agreement_pdf_url} onChange={e => set("agreement_pdf_url", e.target.value)} placeholder="Drive/PDF link" /></Field>

      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-[#a29bfe] hover:bg-[#b3aeff] text-white text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Create Hub"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
