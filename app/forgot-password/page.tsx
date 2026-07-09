"use client";

import { useState } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ name?: string; resetUrl?: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
      setResult(data);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result?.resetUrl) return;
    navigator.clipboard.writeText(result.resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        {!result ? (
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
              className="w-full py-3 rounded-xl font-semibold text-sm bg-accent-success text-primary hover:bg-accent-success disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? "Generating..." : "Generate Reset Link"}
            </button>

            <p className="text-center text-xs text-faint pt-1">
              <Link href="/login" className="text-accent-success hover:underline">← Back to login</Link>
            </p>
          </form>
        ) : result.resetUrl ? (
          <div className="bg-surface-alt border border-default rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-accent-success/20 rounded-full mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-primary font-semibold">Reset link ready</p>
              <p className="text-muted text-xs mt-1">
                {result.name ? `For ${result.name} · ` : ""}Expires in 1 hour
              </p>
            </div>

            <div className="bg-base border border-default rounded-xl p-3 break-all text-xs text-accent-success font-mono select-all">
              {result.resetUrl}
            </div>

            <button
              onClick={handleCopy}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? "bg-accent-success/20 text-accent-success-text" : "bg-accent-success/15 text-accent-success hover:bg-accent-success/25"}`}
            >
              {copied ? "✓ Copied!" : "Copy Reset Link"}
            </button>

            <div className="bg-accent-warning/10 border border-accent-warning/20 rounded-xl px-3 py-2.5 text-xs text-accent-warning-text">
              Email delivery is not configured yet. Share this link with the user via WhatsApp or any other channel.
            </div>

            <p className="text-center text-xs text-faint">
              <Link href="/login" className="text-accent-success hover:underline">← Back to login</Link>
            </p>
          </div>
        ) : (
          <div className="bg-surface-alt border border-default rounded-2xl p-6 text-center space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-accent-success/20 rounded-full mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-primary font-semibold">Check your email</p>
            <p className="text-muted text-sm">If this email exists in our system, a reset link has been sent.</p>
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
