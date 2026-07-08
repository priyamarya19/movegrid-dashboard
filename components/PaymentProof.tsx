"use client";

import ImageUpload from "@/components/ImageUpload";

export type PaymentProofValue = { mode: string; utr: string; proof: string };
export const emptyProof: PaymentProofValue = { mode: "", utr: "", proof: "" };
export const isOnline = (mode: string) => mode === "Online" || mode === "Cash + Online";
// Valid = a mode picked AND a proof image uploaded (screenshot for online, cash photo for cash).
export const proofValid = (v: PaymentProofValue) => !!v.mode && !!v.proof;

const MODES = ["Cash", "Online", "Cash + Online"];
const sel = "w-full bg-[#0A0A0F] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e17055]";
const lbl = "block text-[11px] text-[#555] uppercase tracking-wider mb-1";

export default function PaymentProof({ value, onChange, folder }: {
  value: PaymentProofValue; onChange: (v: PaymentProofValue) => void; folder: string;
}) {
  const online = isOnline(value.mode);
  const set = (k: keyof PaymentProofValue, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>Payment mode <span className="text-red-400">*</span></label>
        <select className={sel} value={value.mode} onChange={e => set("mode", e.target.value)}>
          <option value="">Select mode</option>
          {MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {online && (
        <div>
          <label className={lbl}>UTR / Ref no. <span className="text-[#444] normal-case">(optional)</span></label>
          <input className={sel} value={value.utr} onChange={e => set("utr", e.target.value)} placeholder="Transaction reference" />
        </div>
      )}

      {value.mode && (
        <ImageUpload
          label={value.mode === "Cash" ? "Photo of cash (required)" : "Payment screenshot (required)"}
          folder={folder} value={value.proof} onChange={k => set("proof", k)} />
      )}
    </div>
  );
}
