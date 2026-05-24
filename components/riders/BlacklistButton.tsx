"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  riderId: string;
  isBlacklisted: boolean;
  blacklistReason?: string;
  blacklistedBy?: string;
  blacklistedAt?: string;
  role: string;
};

export default function BlacklistButton({ riderId, isBlacklisted, blacklistReason, blacklistedBy, blacklistedAt, role }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleBlacklist() {
    if (!reason.trim()) return;
    setLoading(true);
    await fetch(`/api/riders/${riderId}/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setLoading(false);
    setShowForm(false);
    router.refresh();
  }

  async function handleUnblacklist() {
    setLoading(true);
    await fetch(`/api/riders/${riderId}/blacklist`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  if (isBlacklisted) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            Blacklisted
          </div>
          {role === "admin" && (
            <button onClick={handleUnblacklist} disabled={loading}
              className="text-xs text-[#555] hover:text-white transition-colors disabled:opacity-50">
              Remove blacklist
            </button>
          )}
        </div>
        {blacklistReason && <p className="text-red-300/80 text-xs">Reason: {blacklistReason}</p>}
        {blacklistedBy && <p className="text-[#555] text-xs">By {blacklistedBy}{blacklistedAt ? ` · ${new Date(blacklistedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>}
      </div>
    );
  }

  if (!["admin", "ops_manager"].includes(role)) return null;

  return showForm ? (
    <div className="bg-[#1a1a2a] border border-red-500/20 rounded-xl p-4 space-y-3">
      <p className="text-white text-sm font-medium">Blacklist this rider?</p>
      <textarea
        className="w-full bg-[#0A0A0F] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
        rows={2}
        placeholder="Reason for blacklisting..."
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={handleBlacklist} disabled={loading || !reason.trim()}
          className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium disabled:opacity-50 transition-colors">
          {loading ? "..." : "Confirm Blacklist"}
        </button>
        <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-white/10 text-[#555] hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button onClick={() => setShowForm(true)}
      className="flex items-center gap-2 text-xs text-[#555] hover:text-red-400 transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      Blacklist this rider
    </button>
  );
}
