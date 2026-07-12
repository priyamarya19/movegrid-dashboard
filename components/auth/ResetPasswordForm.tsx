"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="bg-surface-alt border border-default rounded-2xl p-6 text-center space-y-4">
        <p className="text-accent-danger-alt-text font-semibold">Invalid reset link</p>
        <p className="text-muted text-sm">This link is missing a token. Please request a new reset link.</p>
        <Link href="/forgot-password" className="block text-sm text-accent-success hover:underline">Request new link</Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-surface-alt border border-default rounded-2xl p-6 text-center space-y-4">
        <div className="flex items-center justify-center w-12 h-12 bg-accent-success/20 rounded-full mx-auto">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p className="text-primary font-semibold">Password updated!</p>
        <p className="text-muted text-sm">Redirecting you to login...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-alt border border-default rounded-2xl p-6 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
          New Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            required
            minLength={8}
            className="w-full bg-base border border-default rounded-xl px-4 py-3 pr-11 text-primary placeholder-faint text-sm focus:outline-none focus:border-accent-success transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
          Confirm Password
        </label>
        <input
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          required
          className="w-full bg-base border border-default rounded-xl px-4 py-3 text-primary placeholder-faint text-sm focus:outline-none focus:border-accent-success transition-colors"
        />
      </div>

      {error && <p className="text-accent-danger-alt-text text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-sm bg-accent-success text-on-dark hover:bg-accent-success disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
      >
        {loading ? "Updating..." : "Set New Password"}
      </button>

      <p className="text-center text-xs text-faint">
        <Link href="/login" className="text-accent-success hover:underline">← Back to login</Link>
      </p>
    </form>
  );
}
