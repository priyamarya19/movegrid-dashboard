"use client";

import { useState } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4 relative">
      <Footer className="absolute bottom-4 inset-x-0 px-4" />
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-accent-success rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-primary font-bold text-xl tracking-tight">MoveGrid</span>
          </div>
          <h1 className="text-primary text-2xl font-bold">Reset Password</h1>
          <p className="text-muted text-sm mt-1">Enter your email to get a reset link</p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="bg-surface-alt border border-default rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@movegrid.in"
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
              {loading ? "Generating..." : "Generate Reset Link"}
            </button>

            <p className="text-center text-xs text-faint pt-1">
              <Link href="/login" className="text-accent-success hover:underline">← Back to login</Link>
            </p>
          </form>
        ) : (
          <div className="bg-surface-alt border border-default rounded-2xl p-6 text-center space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-accent-success/20 rounded-full mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-primary font-semibold">Check your email</p>
            <p className="text-muted text-sm">If this email exists in our system, a reset link has been sent. The link expires in 1 hour.</p>
            <Link href="/login" className="block text-xs text-accent-success hover:underline">← Back to login</Link>
          </div>
        )}

        <p className="text-center text-xs text-faint mt-6">
          MoveGrid Technologies Pvt Ltd · Internal Use Only
        </p>
      </div>
    </div>
  );
}
