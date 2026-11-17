"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";
import PaymentProof, { PaymentProofValue, emptyProof, proofValid } from "@/components/PaymentProof";
import { istTodayISO } from "@/lib/date";
import { dateIN } from "@/lib/format";
import { maxCarryForwardDays, suggestedCarryForwardDays, CARRY_FORWARD_WINDOW_DAYS, balanceExpiryDate } from "@/lib/riderBalance";

const CONDITIONS = ["Same as allotted", "Motor damaged", "Controller issue", "Branding issue", "Any other issue"];

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

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-danger transition-colors";

type AssignmentInfo = { id: string; rider_name: string; ev_number: string; assigned_date: string; status: string;
  paid_through_date?: string | null; daily_rent?: number | string | null };

type VehicleOption = { id: string; ev_number: string; rider: string | null };

export default function VehicleReturnForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Which scooter is coming back.
  //
  // This used to be a text box matched exactly against ev_number, which meant
  // typing "N0070" — what everyone actually calls the scooter — found nothing,
  // left the submit button disabled, and gave no clue why. One scooter in the
  // fleet is also spelled MG426N0065 rather than MG0426N0065, so even a careful
  // typist could never find that one. Picking from the list removes the whole
  // class of problem: the only scooters offered are ones that can be returned.
  const [vehicleId, setVehicleId] = useState("");
  const [options, setOptions] = useState<VehicleOption[]>([]);
  // "not fetched yet" and "genuinely none out" look identical on an empty array,
  // and telling someone there are no scooters when the list is still loading is
  // how they give up on the page.
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [evLookingUp, setEvLookingUp] = useState(false);
  const [evError, setEvError] = useState("");

  const [form, setForm] = useState({
    rent_cleared: "" as "" | "true" | "false",
    penalty_amount: "",
    penalty_detail: "",
    condition_on_return: [] as string[],
    return_remarks: "",
    return_photos: ["", "", "", ""],
    returned_date: istTodayISO(),
    is_issue_swap: false,
    non_functional_days: "",
    amount_collected: "",
    carry_forward_days: "",
  });

  const [settle, setSettle] = useState<PaymentProofValue>(emptyProof);

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  // Days the rider paid for and did not ride. The ceiling is arithmetic; the
  // number is a judgement, so ops get the suggestion and the last word.
  const paidThrough = assignment?.paid_through_date ?? null;
  const maxCarry = maxCarryForwardDays(paidThrough, form.returned_date);
  const suggestedCarry = suggestedCarryForwardDays(paidThrough, form.returned_date);
  const carryDays = form.carry_forward_days === "" ? suggestedCarry : Number(form.carry_forward_days);
  const dailyRent = Number(assignment?.daily_rent ?? 0);
  const carryValue = Math.max(0, carryDays) * dailyRent;

  // Reset the choice when the return date moves — the ceiling moved with it.
  useEffect(() => { setForm(p => ({ ...p, carry_forward_days: "" })); }, [form.returned_date, assignment?.id]);

  function toggleCondition(c: string) {
    setForm(p => ({
      ...p,
      condition_on_return: p.condition_on_return.includes(c)
        ? p.condition_on_return.filter(x => x !== c)
        : [...p.condition_on_return, c],
    }));
  }

  // Only scooters currently out with a rider can be handed back, so that is the
  // whole list.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/vehicles?status=assigned");
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const list: VehicleOption[] = (Array.isArray(body) ? body : body.vehicles ?? [])
          .map((v: { id: string; ev_number: string; assigned_rider?: string | null }) => ({
            id: v.id, ev_number: v.ev_number, rider: v.assigned_rider ?? null,
          }))
          .sort((a: VehicleOption, b: VehicleOption) => a.ev_number.localeCompare(b.ev_number));
        if (live) setOptions(list);
      } catch {
        if (live) setOptionsError("Could not load the vehicle list — reload the page and try again.");
      } finally {
        if (live) setOptionsLoaded(true);
      }
    })();
    return () => { live = false; };
  }, []);

  // Resolve the tenancy for whichever scooter was picked.
  useEffect(() => {
    if (!vehicleId) { setAssignment(null); setEvError(""); return; }
    let live = true;
    (async () => {
      setEvLookingUp(true); setEvError("");
      try {
        const aRes = await fetch(`/api/vehicles/${vehicleId}/assignment`);
        if (!live) return;
        if (aRes.ok) setAssignment(await aRes.json());
        else {
          setAssignment(null);
          // The list is built from status='assigned', so this means the two
          // disagree — someone returned it elsewhere while this page was open.
          setEvError("That scooter no longer has an active allotment. Reload the page.");
        }
      } catch {
        if (live) { setAssignment(null); setEvError("Could not load the allotment. Try again."); }
      } finally {
        if (live) setEvLookingUp(false);
      }
    })();
    return () => { live = false; };
  }, [vehicleId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment) { setError("Choose the scooter being returned"); return; }
    if (form.rent_cleared === "true" && !proofValid(settle)) {
      setError("Rent was cleared — select a payment mode and upload the proof image"); return;
    }
    if (form.rent_cleared === "false" && Number(form.amount_collected) > 0 && !proofValid(settle)) {
      setError("Money collected at return — select a payment mode and upload the proof image"); return;
    }
    setSubmitting(true); setError("");
    try {
      const photos = form.return_photos.filter(Boolean);
      const res = await fetch(`/api/allotments/${assignment.id}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returned_date: form.returned_date,
          rent_cleared: form.rent_cleared === "true" ? true : form.rent_cleared === "false" ? false : null,
          penalty_amount: form.penalty_amount ? Number(form.penalty_amount) : null,
          penalty_detail: form.penalty_detail || null,
          condition_on_return: form.condition_on_return.length ? form.condition_on_return : null,
          return_photos: photos.length ? photos : null,
          return_remarks: form.return_remarks || null,
          amount_collected: form.rent_cleared === "false" && form.amount_collected !== "" ? Number(form.amount_collected) : 0,
          carry_forward_days: carryDays,
          rent_settlement_mode: form.rent_cleared === "true" || Number(form.amount_collected) > 0 ? settle.mode : null,
          rent_settlement_utr: form.rent_cleared === "true" || Number(form.amount_collected) > 0 ? (settle.utr || null) : null,
          rent_settlement_proof_url: form.rent_cleared === "true" || Number(form.amount_collected) > 0 ? settle.proof : null,
          is_issue_swap: form.is_issue_swap,
          non_functional_days: form.is_issue_swap && form.non_functional_days ? Number(form.non_functional_days) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to record return"); return; }
      router.push("/vehicles");
    } finally { setSubmitting(false); }
  }

  const Section = ({ title }: { title: string }) => (
    <div className="col-span-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-default" />
        <span className="text-xs font-semibold uppercase tracking-widest text-accent-danger">{title}</span>
        <div className="h-px flex-1 bg-default" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Identify Vehicle" />
        <Field
          label="EV / Scooter Number"
          required
          hint={
            optionsError ? optionsError
            : evLookingUp ? "Loading the allotment…"
            : assignment ? `Rider: ${assignment.rider_name}`
            : evError ? evError
            : !optionsLoaded ? "Loading the list of scooters…"
            : options.length ? `${options.length} scooter${options.length === 1 ? "" : "s"} currently out`
            : "Nothing is out on rent right now"
          }
        >
          <select
            className={inp + (evError || optionsError ? " border-accent-danger-alt/50" : assignment ? " border-accent-success/30" : "")}
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            required
          >
            <option value="">
              {!optionsLoaded ? "Loading…" : options.length ? "Select a scooter…" : "No scooters are currently out"}
            </option>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.ev_number}{v.rider ? ` — ${v.rider}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {assignment && (
          <Field label="Allotment Date">
            <input className={inp + " opacity-60"} value={assignment.assigned_date ? dateIN(assignment.assigned_date) : "—"} readOnly />
          </Field>
        )}
        <Field label="Submission / Return Date" required>
          <input type="date" className={inp} value={form.returned_date} onChange={e => set("returned_date", e.target.value)} required />
        </Field>
        {assignment && maxCarry > 0 && (
          <Field
            label="Days to Carry Forward"
            hint={`Paid through ${dateIN(paidThrough!)}, so up to ${maxCarry} day(s) are unridden. ${
              carryDays > 0
                ? `₹${carryValue.toLocaleString("en-IN")} held for ${CARRY_FORWARD_WINDOW_DAYS} days — usable until ${dateIN(balanceExpiryDate(form.returned_date))}.`
                : "Nothing will be carried."
            }`}
          >
            <input
              type="number" min="0" max={maxCarry} className={inp}
              value={form.carry_forward_days === "" ? String(suggestedCarry) : form.carry_forward_days}
              onChange={e => set("carry_forward_days", e.target.value)}
            />
          </Field>
        )}

        <Section title="Return Details" />
        <Field label="All Rent Paid?" required>
          <select className={"w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-accent-danger transition-colors"} value={form.rent_cleared} onChange={e => set("rent_cleared", e.target.value)} required>
            <option value="">Select</option>
            <option value="true">Yes — all rent paid</option>
            <option value="false">No — pending dues</option>
          </select>
        </Field>
        {form.rent_cleared === "true" && (
          <div className="col-span-full">
            <div className="max-w-xs">
              <p className="text-xs text-accent-danger font-semibold uppercase tracking-wider mb-2">Rent Settlement Proof</p>
              <PaymentProof value={settle} onChange={setSettle} folder="rent-settlement" />
            </div>
          </div>
        )}
        {form.rent_cleared === "false" && (
          <>
            <Field label="Amount Collected Now (₹)" hint="₹0 allowed — whatever remains outstanding becomes bad debt">
              <input type="number" min="0" className={inp} value={form.amount_collected} onChange={e => set("amount_collected", e.target.value)} placeholder="0" />
            </Field>
            {Number(form.amount_collected) > 0 && (
              <div className="col-span-full">
                <div className="max-w-xs">
                  <p className="text-xs text-accent-danger font-semibold uppercase tracking-wider mb-2">Collection Proof</p>
                  <PaymentProof value={settle} onChange={setSettle} folder="rent-settlement" />
                </div>
              </div>
            )}
          </>
        )}
        <Field label="Penalty Amount (₹)"><input type="number" className={inp} value={form.penalty_amount} onChange={e => set("penalty_amount", e.target.value)} placeholder="0" /></Field>
        <Field label="Penalty Details" hint="Damaged parts / reason — saved to the rider's penalties"><input className={inp} value={form.penalty_detail} onChange={e => set("penalty_detail", e.target.value)} placeholder="e.g. Front fender, handle T band" /></Field>
        <Field label="Any Remarks"><input className={inp} value={form.return_remarks} onChange={e => set("return_remarks", e.target.value)} placeholder="Notes on return..." /></Field>

        <div className="col-span-full">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_issue_swap}
              onChange={e => setForm(p => ({ ...p, is_issue_swap: e.target.checked }))}
              className="w-4 h-4 accent-accent-danger"
            />
            <span className="text-sm text-primary">
              Vehicle non-functional — rider is being immediately reallotted a replacement
            </span>
          </label>
          <p className="text-faint text-xs mt-1 ml-6">
            Keeps the rider's rent cycle continuing on the new vehicle instead of restarting — they won't lose rent they've already paid for, or be charged for the days it was down.
          </p>
        </div>
        {form.is_issue_swap && (
          <Field label="Non-Functional Days" required hint="Credited to the rider — subtracted from what they owe on the new vehicle">
            <input type="number" min="0" className={inp} value={form.non_functional_days}
              onChange={e => set("non_functional_days", e.target.value)} placeholder="0" required />
          </Field>
        )}

        <Section title="Scooter Condition" />
        <div className="col-span-full">
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map(c => (
              <button key={c} type="button" onClick={() => toggleCondition(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.condition_on_return.includes(c) ? "bg-accent-danger/13 border-accent-danger text-accent-danger" : "bg-transparent border-strong text-muted hover:border-strong hover:text-secondary"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <Section title="Return Photos" />
        {form.return_photos.map((_, i) => (
          <ImageUpload key={i} label={`Photo ${i + 1}`} folder="returns"
            value={form.return_photos[i]}
            onChange={v => setForm(p => { const ph = [...p.return_photos]; ph[i] = v; return { ...p, return_photos: ph }; })} />
        ))}
        <button type="button"
          onClick={() => setForm(p => ({ ...p, return_photos: [...p.return_photos, ""] }))}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-strong text-muted hover:text-primary hover:border-accent-warning min-h-[7rem] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="text-xs font-medium">Add photo</span>
        </button>

      </div>

      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting || !assignment}
          className="px-6 py-2.5 rounded-xl bg-accent-danger hover:bg-accent-danger text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Record Return"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
