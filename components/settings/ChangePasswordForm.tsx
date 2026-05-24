"use client";

import { useState } from "react";

type FieldState = { current: string; next: string; confirm: string };
type ShowState = { current: boolean; next: boolean; confirm: boolean };

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );

export default function ChangePasswordForm() {
  const [fields, setFields] = useState<FieldState>({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState<ShowState>({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function toggle(k: keyof ShowState) {
    setShow((s) => ({ ...s, [k]: !s[k] }));
  }

  function set(k: keyof FieldState, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
    setError("");
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fields.next !== fields.confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: fields.current, newPassword: fields.next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update password");
        return;
      }
      setSuccess(true);
      setFields({ current: "", next: "", confirm: "" });
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C48C] transition-colors";

  return (
    <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 bg-[#6C5CE720] rounded-lg flex items-center justify-center">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div>
          <h2 className="text-white font-semibold">Change Password</h2>
          <p className="text-[#555] text-xs">Update your login password</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(
          [
            { key: "current" as const, label: "Current Password", placeholder: "Enter current password" },
            { key: "next" as const, label: "New Password", placeholder: "Minimum 8 characters" },
            { key: "confirm" as const, label: "Confirm New Password", placeholder: "Repeat new password" },
          ]
        ).map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">{f.label}</label>
            <div className="relative">
              <input
                type={show[f.key] ? "text" : "password"}
                value={fields[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                required
                minLength={f.key !== "current" ? 8 : undefined}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => toggle(f.key)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <EyeIcon open={show[f.key]} />
              </button>
            </div>
          </div>
        ))}

        <div className="sm:col-span-3 flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[#6C5CE7] hover:bg-[#7d6ff0] text-white text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          {success && (
            <p className="text-green-400 text-sm flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Password updated successfully
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
