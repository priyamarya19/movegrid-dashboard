"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

const RIDER_MODES = ["B2B fleet rental", "Rider rental", "B2B rider"];
const RENTAL_PLANS = ["weekly", "monthly"];

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-accent-danger-alt-text ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-faint text-xs mt-1">{hint}</p>}
    </div>
  );
}

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-warning transition-colors";
const sel = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-accent-warning transition-colors";

type VehicleInfo = { id: string; ev_number: string; chassis_number?: string; motor_number?: string; controller_number?: string; battery_number?: string; oem?: string; model_name?: string; rental_per_day?: number; status?: string; hub_id?: string; hub_name?: string };
type RiderInfo = { id: string; name: string; nickname?: string; mobile: string; rental_mode?: string; rider_mode?: string; onboarding_fee?: number; security_deposit?: number };

export default function AllotmentForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // EV lookup state
  const [evInput, setEvInput] = useState("");
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [evLookingUp, setEvLookingUp] = useState(false);
  const [evError, setEvError] = useState("");
  const evTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readyList, setReadyList] = useState<VehicleInfo[]>([]);

  // Only 'ready_to_deploy' vehicles are allottable — load them for the dropdown.
  useEffect(() => {
    fetch(`/api/vehicles?status=ready_to_deploy`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: VehicleInfo[]) => setReadyList(rows))
      .catch(() => setReadyList([]));
  }, []);

  // Rider lookup state
  const [mobileInput, setMobileInput] = useState("");
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [riderLookingUp, setRiderLookingUp] = useState(false);
  const [riderError, setRiderError] = useState("");

  const [form, setForm] = useState({
    rider_mode: "", rental_plan: "", daily_rent: "",
    onboarding_fee: "", security_deposit: "",
    amount_collected: "", payment_screenshot_url: "",
    undertaking_url: "",
    allotment_pics: ["", "", "", "", ""],
    assigned_date: new Date().toISOString().split("T")[0],
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  // Auto-fill EV details after debounce
  useEffect(() => {
    if (!evInput.trim()) { setVehicle(null); setEvError(""); return; }
    if (evTimer.current) clearTimeout(evTimer.current);
    evTimer.current = setTimeout(async () => {
      setEvLookingUp(true);
      setEvError("");
      try {
        const res = await fetch(`/api/vehicles/lookup?ev_number=${encodeURIComponent(evInput.trim())}`);
        if (res.ok) {
          const v: VehicleInfo = await res.json();
          setVehicle(v);
          // Prefill the daily rate from the vehicle's model default — ops can override.
          if (v.rental_per_day != null) setForm(p => ({ ...p, daily_rent: String(v.rental_per_day) }));
        }
        else { setVehicle(null); setEvError("Vehicle not found"); }
      } finally { setEvLookingUp(false); }
    }, 600);
  }, [evInput]);

  // Rider lookup on blur
  async function lookupRider() {
    if (!mobileInput.trim()) return;
    setRiderLookingUp(true); setRiderError("");
    try {
      const res = await fetch(`/api/vehicles/lookup?mobile=${encodeURIComponent(mobileInput.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setRider(data);
        setForm(p => ({ ...p, rider_mode: data.rider_mode ?? "", rental_plan: data.rental_mode ?? "", onboarding_fee: data.onboarding_fee ?? "", security_deposit: data.security_deposit ?? "" }));
      } else { setRider(null); setRiderError("Rider not found with this mobile"); }
    } finally { setRiderLookingUp(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) { setError("Please enter a valid EV number"); return; }
    if (!rider) { setError("Please look up and confirm the rider"); return; }
    if (vehicle.status === "assigned") { setError("This vehicle is already assigned to another rider"); return; }
    if (vehicle.status !== "ready_to_deploy") { setError("This vehicle is not 'Ready to Deploy'. Ops must clear it first."); return; }

    setSubmitting(true); setError("");
    try {
      const pics = form.allotment_pics.filter(Boolean);
      const res = await fetch("/api/allotments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rider_id: rider.id, vehicle_id: vehicle.id,
          hub_id: vehicle.hub_id ?? null,
          rider_mode: form.rider_mode || null,
          rental_mode: form.rental_plan || null,
          daily_rent: form.daily_rent ? Number(form.daily_rent) : null,
          onboarding_fee: form.onboarding_fee ? Number(form.onboarding_fee) : null,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
          amount_collected: form.amount_collected ? Number(form.amount_collected) : null,
          payment_screenshot_url: form.payment_screenshot_url || null,
          undertaking_url: form.undertaking_url || null,
          allotment_pics: pics.length ? pics : null,
          assigned_date: form.assigned_date,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create allotment"); return; }
      router.push(`/riders/${rider.id}`);
    } finally { setSubmitting(false); }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-default" />
        <span className="text-xs font-semibold uppercase tracking-widest text-accent-warning">{title}</span>
        <div className="h-px flex-1 bg-default" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Vehicle" />
        <Field label="EV / Scooter Number" required hint={evLookingUp ? "Looking up..." : vehicle ? `${vehicle.oem} ${vehicle.model_name} — ✅ ready to deploy` : readyList.length ? "Only ready-to-deploy vehicles are shown" : "No vehicles are ready to deploy yet — ops must clear one first"}>
          <select className={sel + (vehicle ? " border-accent-success/30" : "")}
            value={evInput} onChange={e => setEvInput(e.target.value)} required>
            <option value="">{readyList.length ? "Select a vehicle…" : "None ready to deploy"}</option>
            {readyList.map(v => (
              <option key={v.id} value={v.ev_number}>{v.ev_number} — {v.oem} {v.model_name}</option>
            ))}
          </select>
        </Field>

        {vehicle && (
          <>
            <Field label="Chassis Number"><input className={inp + " opacity-60"} value={vehicle.chassis_number ?? "—"} readOnly /></Field>
            <Field label="Motor Number"><input className={inp + " opacity-60"} value={vehicle.motor_number ?? "—"} readOnly /></Field>
            <Field label="Controller Number"><input className={inp + " opacity-60"} value={vehicle.controller_number ?? "—"} readOnly /></Field>
            <Field label="Battery Number"><input className={inp + " opacity-60"} value={vehicle.battery_number ?? "—"} readOnly /></Field>
            <Field label="Hub"><input className={inp + " opacity-60"} value={vehicle.hub_name ?? "—"} readOnly /></Field>
          </>
        )}

        <Section title="Rider" />
        <Field label="Rider Mobile" required hint={riderLookingUp ? "Looking up..." : rider ? `Found: ${rider.name}${rider.nickname ? ` (${rider.nickname})` : ""}` : riderError}>
          <div className="flex gap-2">
            <input className={inp + (riderError ? " border-accent-danger-alt/50" : rider ? " border-accent-success/30" : "")}
              value={mobileInput} onChange={e => setMobileInput(e.target.value)} placeholder="+91 9876543210" required />
            <button type="button" onClick={lookupRider}
              className="px-4 py-2.5 rounded-xl bg-accent-warning/13 text-accent-warning text-sm font-medium hover:bg-accent-warning/19 transition-colors whitespace-nowrap">
              Look up
            </button>
          </div>
        </Field>

        <Section title="Allotment Terms" />
        <Field label="Rider Mode" required>
          <select className={sel} value={form.rider_mode} onChange={e => set("rider_mode", e.target.value)} required>
            <option value="">Select mode</option>
            {RIDER_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Rental Plan" required>
          <select className={sel} value={form.rental_plan} onChange={e => set("rental_plan", e.target.value)} required>
            <option value="">Select plan</option>
            {RENTAL_PLANS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Daily Rental (₹)" required hint="Prefilled from the vehicle's model rate — edit if the rider's km/usage deal differs">
          <input type="number" className={inp} value={form.daily_rent} onChange={e => set("daily_rent", e.target.value)} placeholder="e.g. 240" required />
        </Field>
        <Field label="Onboarding Fee (₹)"><input type="number" className={inp} value={form.onboarding_fee} onChange={e => set("onboarding_fee", e.target.value)} placeholder="0" /></Field>
        <Field label="Security Deposit (₹)"><input type="number" className={inp} value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="0" /></Field>
        <Field label="Amount Collected (₹)" required hint="Total of onboarding fee + security deposit">
          <input type="number" className={inp} value={form.amount_collected} onChange={e => set("amount_collected", e.target.value)} placeholder="0" required />
        </Field>
        <ImageUpload label="Payment Screenshot" folder="payments" value={form.payment_screenshot_url} onChange={v => set("payment_screenshot_url", v)} />
        <ImageUpload label="Signed Undertaking" folder="undertakings" value={form.undertaking_url} onChange={v => set("undertaking_url", v)} />
        <Field label="Allotment Date" required><input type="date" className={inp} value={form.assigned_date} onChange={e => set("assigned_date", e.target.value)} required /></Field>

        <Section title="Allotment Photos (up to 5)" />
        {["Front", "Left side", "Right side", "Back", "Rider on scooter"].map((label, i) => (
          <ImageUpload key={i} label={label} folder="allotments"
            value={form.allotment_pics[i]}
            onChange={v => setForm(p => { const pics = [...p.allotment_pics]; pics[i] = v; return { ...p, allotment_pics: pics }; })} />
        ))}

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting || !vehicle || !rider}
          className="px-6 py-2.5 rounded-xl bg-accent-warning hover:bg-accent-warning text-on-dark text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Confirm Allotment"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
