"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";
import { istTodayISO } from "@/lib/date";
import { defaultRentStart, rentStartReason } from "@/lib/rentStart";
import { useApprovalGate, ApprovalPanel } from "@/components/ApprovalGate";

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
    amount_collected: "", rent_collected: "", payment_screenshot_url: "",
    undertaking_url: "",
    allotment_pics: ["", "", "", "", ""],
    assigned_date: istTodayISO(),
    rent_start_date: defaultRentStart(istTodayISO()),
  });
  const gate = useApprovalGate();

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  // The default follows the allotment date: back-date the handover and the
  // free day comes back, because today's clock says nothing about when that
  // rider actually collected.
  const suggestedStart = defaultRentStart(form.assigned_date);
  const startOverridden = form.rent_start_date !== suggestedStart;
  const rentStartHint = startOverridden
    ? `Normally ${suggestedStart} — ${rentStartReason(form.assigned_date)}. A different date needs an admin's approval.`
    : `${rentStartReason(form.assigned_date)}`;

  // Correcting the handover day moves the suggested start with it — until ops
  // deliberately type a start date, after which their choice stands.
  const [startTouched, setStartTouched] = useState(false);

  // Rent is what's left after the fee and the deposit. Ops used to have to work
  // that out and type it, and the first allotment after this field shipped had
  // ₹3,180 collected with ₹0 of rent — a rider who had paid a full week looked
  // overdue the next morning. So we do the subtraction and they correct it.
  const [rentTouched, setRentTouched] = useState(false);
  const suggestedRent = Math.max(
    0,
    (Number(form.amount_collected) || 0) - (Number(form.onboarding_fee) || 0) - (Number(form.security_deposit) || 0)
  );
  useEffect(() => {
    if (!startTouched) setForm(p => ({ ...p, rent_start_date: defaultRentStart(p.assigned_date) }));
  }, [form.assigned_date, startTouched]);

  useEffect(() => {
    if (!rentTouched) setForm(p => ({ ...p, rent_collected: suggestedRent ? String(suggestedRent) : "" }));
  }, [suggestedRent, rentTouched]);

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
    await submit();
  }

  async function submit(approvalId?: string) {
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
          rent_collected: form.rent_collected === "" ? null : Number(form.rent_collected),
          payment_screenshot_url: form.payment_screenshot_url || null,
          undertaking_url: form.undertaking_url || null,
          allotment_pics: pics.length ? pics : null,
          assigned_date: form.assigned_date,
          rent_start_date: form.rent_start_date,
          ...(approvalId ? { approval_id: approvalId } : {}),
        }),
      });
      const data = await res.json();

      // 428: the start date isn't the one the clock implies, so an admin has to
      // sign it off. The server hands back the exact values it will check.
      if (res.status === 428 && data.approval) {
        gate.reset();
        const sent = await gate.request(data.approval);
        if (!sent) setError(gate.error || "Could not reach an approver");
        return;
      }
      if (!res.ok) { setError(data.error || "Failed to create allotment"); return; }
      gate.reset();
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
        {/* An allotment entered on Wednesday for a scooter handed over on
            Monday must be backdated. The ops app has always had this field; the
            web form was silently sending today. */}
        <Field label="Allotment Date" required hint="The day the rider actually took the scooter">
          <input type="date" className={inp} value={form.assigned_date} onChange={e => set("assigned_date", e.target.value)} max={istTodayISO()} required />
        </Field>
        {/* The 3 PM rule. The default is computed, shown with its reason, and
            typing anything else costs an admin's code — the whole point being
            that a free day is a real ₹240 decision, not a form field. */}
        <Field label="Rent Starts" required hint={rentStartHint}>
          <input type="date" className={inp} value={form.rent_start_date}
            onChange={e => { setStartTouched(true); set("rent_start_date", e.target.value); }} required />
        </Field>
        <Field label="Daily Rental (₹)" required hint="Prefilled from the vehicle's model rate — edit if the rider's km/usage deal differs">
          <input type="number" className={inp} value={form.daily_rent} onChange={e => set("daily_rent", e.target.value)} placeholder="e.g. 240" required />
        </Field>
        <Field label="Onboarding Fee (₹)"><input type="number" className={inp} value={form.onboarding_fee} onChange={e => set("onboarding_fee", e.target.value)} placeholder="0" /></Field>
        <Field label="Security Deposit (₹)"><input type="number" className={inp} value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="0" /></Field>
        <Field label="Amount Collected (₹)" required hint="Everything taken at handover — fee, deposit and rent together. ₹0 is allowed.">
          <input type="number" min="0" className={inp} value={form.amount_collected} onChange={e => set("amount_collected", e.target.value)} placeholder="0" required />
        </Field>
        {/* Suggested, then stated. Inferring it silently invented ₹8,817 of
            payments that never happened; leaving it blank and mandatory made
            ops enter ₹0 on a rider who had paid a full week. So: show the
            arithmetic, let them override it, and say plainly when ₹0 means the
            rider bought no days. */}
        <Field
          label="Of which, rent (₹)"
          required
          hint={
            Number(form.rent_collected) === 0 && Number(form.amount_collected) > 0
              ? "₹0 means the rider buys no days and shows as due tomorrow. Right for a no-cash swap — otherwise enter the rent."
              : `Fee and deposit taken out. ${
                  Number(form.daily_rent) > 0 && Number(form.rent_collected) > 0
                    ? `Buys ${Math.floor(Number(form.rent_collected) / Number(form.daily_rent))} day(s).`
                    : "Edit if the split is different."
                }`
          }
        >
          <input
            type="number" min="0"
            className={inp + (Number(form.rent_collected) === 0 && Number(form.amount_collected) > 0 ? " border-accent-warning/60" : "")}
            value={form.rent_collected}
            onChange={e => { setRentTouched(true); set("rent_collected", e.target.value); }}
            placeholder="0" required
          />
        </Field>
        <ImageUpload label="Payment Screenshot" folder="payments" value={form.payment_screenshot_url} onChange={v => set("payment_screenshot_url", v)} />
        <ImageUpload label="Signed Undertaking" folder="undertakings" value={form.undertaking_url} onChange={v => set("undertaking_url", v)} />
        <Section title="Allotment Photos" />
        {form.allotment_pics.map((_, i) => (
          <ImageUpload key={i} label={["Front", "Left side", "Right side", "Back", "Rider on scooter"][i] ?? `Photo ${i + 1}`} folder="allotments"
            value={form.allotment_pics[i]}
            onChange={v => setForm(p => { const pics = [...p.allotment_pics]; pics[i] = v; return { ...p, allotment_pics: pics }; })} />
        ))}
        <button type="button"
          onClick={() => setForm(p => ({ ...p, allotment_pics: [...p.allotment_pics, ""] }))}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-strong text-muted hover:text-primary hover:border-accent-warning min-h-[7rem] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="text-xs font-medium">Add photo</span>
        </button>

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <ApprovalPanel gate={gate} actionLabel="Approve & allot" onApproved={(id) => submit(id)} />

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
