"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

const CONDITIONS = ["Same as allotted", "Motor damaged", "Controller issue", "Branding issue", "Any other issue"];

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[#444] text-xs mt-1">{hint}</p>}
    </div>
  );
}

const inp = "w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#e17055] transition-colors";

type AssignmentInfo = { id: string; rider_name: string; ev_number: string; assigned_date: string; status: string };

export default function VehicleReturnForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // EV lookup
  const [evInput, setEvInput] = useState("");
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [evLookingUp, setEvLookingUp] = useState(false);
  const [evError, setEvError] = useState("");
  const evTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    rent_cleared: "" as "" | "true" | "false",
    penalty_amount: "",
    condition_on_return: [] as string[],
    return_remarks: "",
    return_photos: ["", "", ""],
    returned_date: new Date().toISOString().split("T")[0],
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function toggleCondition(c: string) {
    setForm(p => ({
      ...p,
      condition_on_return: p.condition_on_return.includes(c)
        ? p.condition_on_return.filter(x => x !== c)
        : [...p.condition_on_return, c],
    }));
  }

  // Auto-lookup active assignment by EV number
  useEffect(() => {
    if (!evInput.trim()) { setAssignment(null); setEvError(""); return; }
    if (evTimer.current) clearTimeout(evTimer.current);
    evTimer.current = setTimeout(async () => {
      setEvLookingUp(true); setEvError("");
      try {
        const res = await fetch(`/api/vehicles/lookup?ev_number=${encodeURIComponent(evInput.trim())}`);
        if (res.ok) {
          const v = await res.json();
          if (v.status !== "assigned") { setAssignment(null); setEvError("This vehicle has no active allotment"); return; }
          // Fetch active assignment details
          const aRes = await fetch(`/api/vehicles/${v.id}/assignment`);
          if (aRes.ok) setAssignment(await aRes.json());
          else setAssignment({ id: v.id, rider_name: "Unknown", ev_number: v.ev_number, assigned_date: "", status: "assigned" });
        } else { setAssignment(null); setEvError("Vehicle not found"); }
      } finally { setEvLookingUp(false); }
    }, 600);
  }, [evInput]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment) { setError("Please enter a valid EV number with an active allotment"); return; }
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
          condition_on_return: form.condition_on_return.length ? form.condition_on_return : null,
          return_photos: photos.length ? photos : null,
          return_remarks: form.return_remarks || null,
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
        <div className="h-px flex-1 bg-[#1e1e2e]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[#e17055]">{title}</span>
        <div className="h-px flex-1 bg-[#1e1e2e]" />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <Section title="Identify Vehicle" />
        <Field label="EV / Scooter Number" required hint={evLookingUp ? "Looking up..." : assignment ? `Active allotment found — Rider: ${assignment.rider_name}` : evError}>
          <input className={inp + (evError ? " border-red-500/50" : assignment ? " border-green-500/30" : "")}
            value={evInput} onChange={e => setEvInput(e.target.value)} placeholder="MG-001" required />
        </Field>
        {assignment && (
          <Field label="Allotment Date">
            <input className={inp + " opacity-60"} value={assignment.assigned_date ? new Date(assignment.assigned_date).toLocaleDateString("en-IN") : "—"} readOnly />
          </Field>
        )}
        <Field label="Submission / Return Date" required>
          <input type="date" className={inp} value={form.returned_date} onChange={e => set("returned_date", e.target.value)} required />
        </Field>

        <Section title="Return Details" />
        <Field label="All Rent Paid?" required>
          <select className={"w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#e17055] transition-colors"} value={form.rent_cleared} onChange={e => set("rent_cleared", e.target.value)} required>
            <option value="">Select</option>
            <option value="true">Yes — all rent paid</option>
            <option value="false">No — pending dues</option>
          </select>
        </Field>
        <Field label="Penalty Amount (₹)"><input type="number" className={inp} value={form.penalty_amount} onChange={e => set("penalty_amount", e.target.value)} placeholder="0" /></Field>
        <Field label="Any Remarks"><input className={inp} value={form.return_remarks} onChange={e => set("return_remarks", e.target.value)} placeholder="Notes on return..." /></Field>

        <Section title="Scooter Condition" />
        <div className="col-span-full">
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map(c => (
              <button key={c} type="button" onClick={() => toggleCondition(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.condition_on_return.includes(c) ? "bg-[#e1705520] border-[#e17055] text-[#e17055]" : "bg-transparent border-[#333] text-[#555] hover:border-[#555] hover:text-[#aaa]"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <Section title="Return Photos" />
        {["Photo 1", "Photo 2", "Photo 3"].map((label, i) => (
          <ImageUpload key={i} label={label} folder="returns"
            value={form.return_photos[i]}
            onChange={v => setForm(p => { const ph = [...p.return_photos]; ph[i] = v; return { ...p, return_photos: ph }; })} />
        ))}

      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting || !assignment}
          className="px-6 py-2.5 rounded-xl bg-[#e17055] hover:bg-[#f08070] text-white text-sm font-semibold disabled:opacity-60 transition-colors">
          {submitting ? "Saving..." : "Record Return"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
