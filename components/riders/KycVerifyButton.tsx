"use client";

import { useState } from "react";

type Props = {
  riderId: string;
  document: "aadhaar" | "pan" | "dl";
  initialVerified: boolean;
  initialVerifiedBy?: string | null;
  initialVerifiedAt?: string | null;
};

export default function KycVerifyButton({ riderId, document, initialVerified, initialVerifiedBy, initialVerifiedAt }: Props) {
  const [verified, setVerified] = useState(initialVerified);
  const [verifiedBy, setVerifiedBy] = useState(initialVerifiedBy ?? null);
  const [verifiedAt, setVerifiedAt] = useState(initialVerifiedAt ?? null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const res = await fetch(`/api/riders/${riderId}/kyc`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, verified: !verified }),
    });
    if (res.ok) {
      const data = await res.json();
      setVerified(data.verified);
      setVerifiedBy(data.verified_by);
      setVerifiedAt(data.verified ? new Date().toISOString() : null);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1e1e2e]">
      {verified ? (
        <div>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D1B2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="text-[#00D1B2] text-xs font-semibold">Verified</span>
          </div>
          {verifiedBy && (
            <p className="text-[#444] text-[10px] mt-0.5">
              by {verifiedBy}
              {verifiedAt ? " · " + new Date(verifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fdcb6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="text-[#fdcb6e] text-xs font-semibold">Unverified</span>
        </div>
      )}

      <button onClick={toggle} disabled={loading}
        className={`text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed
          ${verified
            ? "border-[#333] text-[#555] hover:border-red-500/50 hover:text-red-400"
            : "border-[#6C5CE740] text-[#6C5CE7] hover:bg-[#6C5CE720]"
          }`}>
        {loading ? "..." : verified ? "Revoke" : "Mark Verified"}
      </button>
    </div>
  );
}
