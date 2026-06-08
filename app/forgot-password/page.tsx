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
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 relative">
      <Footer className="absolute bottom-4 inset-x-0 px-4" />
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[#00C48C] rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">MoveGrid</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Reset Password</h1>
          <p className="text-gray-400 text-sm mt-1">Enter your email to get a reset link</p>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="bg-[#111118] border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@movegrid.in"
                required
                className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#00C48C] transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[#00C48C] text-white hover:bg-[#00E0A0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? "Generating..." : "Generate Reset Link"}
            </button>

            <p className="text-center text-xs text-gray-600 pt-1">
              <Link href="/login" className="text-[#00C48C] hover:underline">← Back to login</Link>
            </p>
          </form>
        ) : result.resetUrl ? (
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-[#00C48C]/20 rounded-full mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00C48C" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">Reset link ready</p>
              <p className="text-gray-400 text-xs mt-1">
                {result.name ? `For ${result.name} · ` : ""}Expires in 1 hour
              </p>
            </div>

            <div className="bg-[#0A0A0F] border border-white/10 rounded-xl p-3 break-all text-xs text-[#00C48C] font-mono select-all">
              {result.resetUrl}
            </div>

            <button
              onClick={handleCopy}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? "bg-green-500/20 text-green-400" : "bg-[#00C48C]/15 text-[#00C48C] hover:bg-[#00C48C]/25"}`}
            >
              {copied ? "✓ Copied!" : "Copy Reset Link"}
            </button>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 text-xs text-yellow-400">
              Email delivery is not configured yet. Share this link with the user via WhatsApp or any other channel.
            </div>

            <p className="text-center text-xs text-gray-600">
              <Link href="/login" className="text-[#00C48C] hover:underline">← Back to login</Link>
            </p>
          </div>
        ) : (
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 text-center space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-[#00C48C]/20 rounded-full mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00C48C" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-white font-semibold">Check your email</p>
            <p className="text-gray-400 text-sm">If this email exists in our system, a reset link has been sent.</p>
            <Link href="/login" className="block text-xs text-[#00C48C] hover:underline">← Back to login</Link>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">
          MoveGrid Technologies Pvt Ltd · Internal Use Only
        </p>
      </div>
    </div>
  );
}
