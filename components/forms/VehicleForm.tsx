"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

type Hub = { id: string; hub_name: string; city: string };

const OEMS = ["Shelby", "NXTE", "E-sprinto"];
const IOT_PARTNERS = ["Fixx ev/Loconav", "Roadcast"];
const BATTERY_PARTNERS = ["Battery Smart", "Sun Mobility", "Yuma", "Mooving"];

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

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-teal transition-colors";
const sel = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-accent-teal transition-colors";

export default function VehicleForm() {
  const router = useRouter();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    ev_number: "", chassis_number: "", motor_number: "", controller_number: "",
    oem: "", iot_imei: "", iot_partner: "", battery_number: "", battery_partner: "",
    hub_id: "", purchase_date: "", price: "",
    vehicle_photo_url: "", rc_book_url: "",
  });

  useEffect(() => { fetch("/api/hubs").then(r => r.json()).then(setHubs); }, []);

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: form.price ? Number(form.price) : null, hub_id: form.hub_id || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create vehicle"); return; }
      router.push(`/vehicles/${data.id}`);
    } finally { setSubmitting(false); }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-default" />
        <span className="text-xs font-semibold uppercase tracking-widest text-accent-teal">{title}</span>
        <div className="h-px flex-1 bg-default" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Vehicle Identity" />
        <Field label="EV Number" required><input className={inp} value={form.ev_number} onChange={e => set("ev_number", e.target.value)} placeholder="MG-001" required /></Field>
        <Field label="OEM / Assembler" required>
          <select className={sel} value={form.oem} onChange={e => set("oem", e.target.value)} required>
            <option value="">Select OEM</option>
            {OEMS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Hub">
          <select className={sel} value={form.hub_id} onChange={e => set("hub_id", e.target.value)}>
            <option value="">Select hub (optional)</option>
            {hubs.map(h => <option key={h.id} value={h.id}>{h.hub_name} — {h.city}</option>)}
          </select>
        </Field>

        <Section title="Hardware Numbers" />
        <Field label="Chassis Number" required><input className={inp} value={form.chassis_number} onChange={e => set("chassis_number", e.target.value)} placeholder="Chassis number" required /></Field>
        <Field label="Motor Number" required><input className={inp} value={form.motor_number} onChange={e => set("motor_number", e.target.value)} placeholder="Motor number" required /></Field>
        <Field label="Controller Number" required><input className={inp} value={form.controller_number} onChange={e => set("controller_number", e.target.value)} placeholder="Controller number" required /></Field>

        <Section title="IOT" />
        <Field label="IOT / IMEI Number"><input className={inp} value={form.iot_imei} onChange={e => set("iot_imei", e.target.value)} placeholder="IMEI number" /></Field>
        <Field label="IOT Partner">
          <select className={sel} value={form.iot_partner} onChange={e => set("iot_partner", e.target.value)}>
            <option value="">Select partner</option>
            {IOT_PARTNERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Section title="Battery" />
        <Field label="Battery Number"><input className={inp} value={form.battery_number} onChange={e => set("battery_number", e.target.value)} placeholder="Battery number" /></Field>
        <Field label="Battery Partner">
          <select className={sel} value={form.battery_partner} onChange={e => set("battery_partner", e.target.value)}>
            <option value="">Select partner</option>
            {BATTERY_PARTNERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Section title="Purchase Info" />
        <Field label="Purchase Date"><input type="date" className={inp} value={form.purchase_date} onChange={e => set("purchase_date", e.target.value)} /></Field>
        <Field label="Purchase Price (₹)"><input type="number" className={inp} value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" /></Field>

        <Section title="Documents & Photos" />
        <ImageUpload label="Vehicle Photo" folder="vehicles" value={form.vehicle_photo_url} onChange={v => set("vehicle_photo_url", v)} />
        <ImageUpload label="RC Book" folder="vehicles" value={form.rc_book_url} onChange={v => set("rc_book_url", v)} />

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-accent-teal hover:bg-accent-success text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Add Vehicle"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
