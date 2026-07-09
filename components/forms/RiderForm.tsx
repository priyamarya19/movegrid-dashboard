"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

type Hub = { id: string; hub_name: string; city: string };

const RENTAL_MODES = ["monthly", "weekly", "fortnightly"];
const B2B_COMPANIES = ["Swiggy", "Zomato", "Blinkit", "Dunzo", "Zepto", "Porter", "Other"];

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

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-purple transition-colors";
const sel = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-accent-purple transition-colors";

export default function RiderForm() {
  const router = useRouter();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [blacklistWarning, setBlacklistWarning] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", nickname: "", mobile: "",
    current_address: "", permanent_address: "", address_map_link: "",
    aadhaar: "", aadhaar_front_url: "", aadhaar_back_url: "",
    pan: "", pan_image_url: "",
    dl_number: "", dl_front_url: "", dl_back_url: "",
    bank: "", ifsc: "", account_number: "", bank_doc_url: "",
    family_ref_name: "", family_ref_mobile: "", family_ref_aadhaar: "", family_ref_aadhaar_url: "",
    local_ref_name: "", local_ref_mobile: "",
    rental_mode: "monthly",
    business_type: "rental",
    b2b_company: "", b2b_location: "",
    employer: "",
    onboarding_fee: "", security_deposit: "",
    assigned_hub_id: "",
    profile_photo_url: "",
  });

  useEffect(() => {
    fetch("/api/hubs").then(r => r.json()).then(setHubs);
  }, []);

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function checkBlacklist(aadhaar: string) {
    const clean = aadhaar.replace(/\s/g, "");
    if (clean.length < 12) { setBlacklistWarning(null); return; }
    const res = await fetch(`/api/riders/blacklist-check?aadhaar=${encodeURIComponent(clean)}`);
    const data = await res.json();
    if (data.blacklisted) {
      setBlacklistWarning(data.reason ? `Blacklisted: ${data.reason}` : "This rider has been blacklisted.");
    } else {
      setBlacklistWarning(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/riders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          onboarding_fee: form.onboarding_fee ? Number(form.onboarding_fee) : null,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
          assigned_hub_id: form.assigned_hub_id || null,
          b2b_company: form.business_type === "b2b" ? form.b2b_company : null,
          b2b_location: form.business_type === "b2b" ? form.b2b_location : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create rider"); return; }
      router.push(`/riders/${data.id}`);
    } finally { setSubmitting(false); }
  }

  const Section = ({ title, color = "var(--accent-purple)" }: { title: string; color?: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-default" />
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{title}</span>
        <div className="h-px flex-1 bg-default" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Personal Info" />
        <Field label="Full Name" required><input className={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ravi Kumar" required /></Field>
        <Field label="Nickname"><input className={inp} value={form.nickname} onChange={e => set("nickname", e.target.value)} placeholder="Ravi" /></Field>
        <Field label="Mobile Number" required><input className={inp} value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="+91 9876543210" required /></Field>
        <ImageUpload label="Rider Photo" folder="riders" value={form.profile_photo_url} onChange={v => set("profile_photo_url", v)} />
        <div className="col-span-full sm:col-span-1" />

        <Field label="Current Address" required>
          <textarea className={inp + " resize-none"} rows={2} value={form.current_address} onChange={e => set("current_address", e.target.value)} placeholder="Current residential address" required />
        </Field>
        <Field label="Permanent Address">
          <textarea className={inp + " resize-none"} rows={2} value={form.permanent_address} onChange={e => set("permanent_address", e.target.value)} placeholder="Permanent address (from Aadhaar)" />
        </Field>
        <Field label="Address Map Link"><input className={inp} value={form.address_map_link} onChange={e => set("address_map_link", e.target.value)} placeholder="Google Maps URL" /></Field>

        <Section title="Identity Documents" />
        <Field label="Aadhaar Number">
          <input
            className={inp + (blacklistWarning ? " border-accent-danger-alt" : "")}
            value={form.aadhaar}
            onChange={e => set("aadhaar", e.target.value)}
            onBlur={e => checkBlacklist(e.target.value)}
            placeholder="XXXX XXXX XXXX"
            maxLength={14}
          />
          {blacklistWarning && (
            <div className="mt-1.5 flex items-start gap-2 bg-accent-danger-alt/10 border border-accent-danger-alt/30 rounded-lg px-3 py-2">
              <span className="text-accent-danger-alt-text text-lg leading-none">⚠</span>
              <p className="text-accent-danger-alt-text text-xs font-medium">{blacklistWarning}</p>
            </div>
          )}
        </Field>
        <ImageUpload label="Aadhaar Front" folder="kyc" value={form.aadhaar_front_url} onChange={v => set("aadhaar_front_url", v)} />
        <ImageUpload label="Aadhaar Back" folder="kyc" value={form.aadhaar_back_url} onChange={v => set("aadhaar_back_url", v)} />
        <Field label="PAN Number"><input className={inp} value={form.pan} onChange={e => set("pan", e.target.value)} placeholder="ABCDE1234F" maxLength={10} /></Field>
        <ImageUpload label="PAN Card" folder="kyc" value={form.pan_image_url} onChange={v => set("pan_image_url", v)} />
        <div />
        <Field label="DL Number"><input className={inp} value={form.dl_number} onChange={e => set("dl_number", e.target.value)} placeholder="DL-XXXXXXXXXX" /></Field>
        <ImageUpload label="DL Front" folder="kyc" value={form.dl_front_url} onChange={v => set("dl_front_url", v)} />
        <ImageUpload label="DL Back" folder="kyc" value={form.dl_back_url} onChange={v => set("dl_back_url", v)} />

        <Section title="Bank Details" />
        <Field label="Bank Name"><input className={inp} value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="SBI / HDFC / etc." /></Field>
        <Field label="Account Number"><input className={inp} value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Account number" /></Field>
        <Field label="IFSC Code"><input className={inp} value={form.ifsc} onChange={e => set("ifsc", e.target.value)} placeholder="SBIN0001234" /></Field>
        <ImageUpload label="Passbook / Cancelled Cheque" folder="kyc" value={form.bank_doc_url} onChange={v => set("bank_doc_url", v)} />

        <Section title="References" />
        <Field label="Family Ref Name"><input className={inp} value={form.family_ref_name} onChange={e => set("family_ref_name", e.target.value)} placeholder="Name" /></Field>
        <Field label="Family Ref Mobile"><input className={inp} value={form.family_ref_mobile} onChange={e => set("family_ref_mobile", e.target.value)} placeholder="+91 XXXXXXXXXX" /></Field>
        <Field label="Family Ref Aadhaar"><input className={inp} value={form.family_ref_aadhaar} onChange={e => set("family_ref_aadhaar", e.target.value)} placeholder="XXXX XXXX XXXX" /></Field>
        <ImageUpload label="Family Ref Aadhaar Doc" folder="kyc" value={form.family_ref_aadhaar_url} onChange={v => set("family_ref_aadhaar_url", v)} />
        <Field label="Local Ref Name"><input className={inp} value={form.local_ref_name} onChange={e => set("local_ref_name", e.target.value)} placeholder="Name" /></Field>
        <Field label="Local Ref Mobile"><input className={inp} value={form.local_ref_mobile} onChange={e => set("local_ref_mobile", e.target.value)} placeholder="+91 XXXXXXXXXX" /></Field>

        <Section title="Onboarding" />
        <Field label="Hub">
          <select className={sel} value={form.assigned_hub_id} onChange={e => set("assigned_hub_id", e.target.value)}>
            <option value="">Select hub (optional)</option>
            {hubs.map(h => <option key={h.id} value={h.id}>{h.hub_name} — {h.city}</option>)}
          </select>
        </Field>
        <Field label="Rent Cycle" required>
          <select className={sel} value={form.rental_mode} onChange={e => set("rental_mode", e.target.value)}>
            {RENTAL_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Employer (delivery company)">
          <input className={inp} value={form.employer} onChange={e => set("employer", e.target.value)} placeholder="e.g. Blinkit, Zepto, Personal Use" />
        </Field>

        <Field label="Onboarding Fee (₹)"><input type="number" className={inp} value={form.onboarding_fee} onChange={e => set("onboarding_fee", e.target.value)} placeholder="0" /></Field>
        <Field label="Security Deposit (₹)"><input type="number" className={inp} value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="0" /></Field>

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-accent-purple hover:bg-accent-purple text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Create Rider"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
