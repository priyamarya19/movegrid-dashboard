"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export type HubFormValues = Partial<Record<
  | "hub_name" | "city" | "area" | "vehicle_capacity"
  | "address" | "map_link" | "contact_name" | "contact_mobile"
  | "owner_name" | "owner_mobile"
  | "security_deposit" | "monthly_rent" | "agreement_pdf_url",
  string | number | null
>> & { id?: string };

// One component for both create and edit. `hub` present ⇒ edit mode: PATCHes
// that hub instead of POSTing a new one. Edit exists mainly so the rider-facing
// map link and ops contact can be filled in on a hub that already exists.
export default function HubForm({ hub }: { hub?: HubFormValues } = {}) {
  const router = useRouter();
  const editing = !!hub?.id;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  const [form, setForm] = useState({
    hub_name: str(hub?.hub_name), city: str(hub?.city), area: str(hub?.area),
    vehicle_capacity: str(hub?.vehicle_capacity),
    address: str(hub?.address), map_link: str(hub?.map_link),
    contact_name: str(hub?.contact_name), contact_mobile: str(hub?.contact_mobile),
    owner_name: str(hub?.owner_name), owner_mobile: str(hub?.owner_mobile),
    security_deposit: str(hub?.security_deposit), monthly_rent: str(hub?.monthly_rent),
    agreement_pdf_url: str(hub?.agreement_pdf_url),
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      const res = await fetch(editing ? `/api/hubs/${hub!.id}` : "/api/hubs", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vehicle_capacity: form.vehicle_capacity ? Number(form.vehicle_capacity) : null,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
          monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
          agreement_pdf_url: form.agreement_pdf_url || null,
          address: form.address || null,
          map_link: form.map_link || null,
          contact_name: form.contact_name || null,
          contact_mobile: form.contact_mobile || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Failed to ${editing ? "update" : "create"} hub`); return; }
      router.push(`/hubs/${editing ? hub!.id : data.id}`);
      router.refresh();
    } finally { setSubmitting(false); }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-default" />
        <span className="text-xs font-semibold uppercase tracking-widest text-accent-purple-2">{title}</span>
        <div className="h-px flex-1 bg-default" />
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

        <Section title="Rider-facing — shown in the rider app" />
        <Field label="Full Address">
          <input className={inp} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Shop 4, Sector 122, Noida 201301" />
        </Field>
        <Field label="Google Maps Link">
          <input className={inp} value={form.map_link} onChange={e => set("map_link", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
        </Field>
        <div className="hidden lg:block" />
        <Field label="Ops Contact Name">
          <input className={inp} value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Ajay Mathur" />
        </Field>
        <Field label="Ops Contact Mobile">
          <input className={inp} value={form.contact_mobile} onChange={e => set("contact_mobile", e.target.value)} placeholder="9354706352" inputMode="numeric" />
        </Field>
        <div className="col-span-full -mt-2">
          <p className="text-faint text-xs">
            Riders waiting for KYC see this address, tap the map link to navigate, and call this number directly.
            The map button stays hidden until a link is saved.
          </p>
        </div>

        <Section title="Owner / Landlord" />
        <Field label="Owner Name"><input className={inp} value={form.owner_name} onChange={e => set("owner_name", e.target.value)} placeholder="Owner's full name" /></Field>
        <Field label="Owner Mobile"><input className={inp} value={form.owner_mobile} onChange={e => set("owner_mobile", e.target.value)} placeholder="+91 9876543210" /></Field>

        <Section title="Financial Terms" />
        <Field label="Monthly Rent (₹)"><input type="number" className={inp} value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)} placeholder="0" /></Field>
        <Field label="Security Deposit (₹)"><input type="number" className={inp} value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="0" /></Field>
        <Field label="Agreement PDF (URL)"><input className={inp} value={form.agreement_pdf_url} onChange={e => set("agreement_pdf_url", e.target.value)} placeholder="Drive/PDF link" /></Field>

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-accent-purple-2 hover:bg-accent-purple-2 text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : editing ? "Save Changes" : "Create Hub"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
