"use client";

import { useState } from "react";

const inp = "w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-success transition-colors";

export default function SupportForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!subject.trim() || !message.trim()) { setError("Please fill in both fields"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      setDone(true);
      setSubject("");
      setMessage("");
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div className="text-center py-6 space-y-3">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-accent-success/20 text-accent-success-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p className="text-primary font-medium">Your request has been sent</p>
        <p className="text-muted text-sm">A copy has been emailed to you. The MoveGrid team will get back to you shortly.</p>
        <button onClick={() => setDone(false)} className="mt-1 px-4 py-2 rounded-lg border border-default text-secondary hover:text-primary text-sm transition-colors">
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Subject <span className="text-accent-danger-alt-text">*</span></label>
        <input className={inp} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" required />
      </div>
      <div>
        <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Message <span className="text-accent-danger-alt-text">*</span></label>
        <textarea className={`${inp} resize-none`} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your query or issue…" required />
      </div>
      {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}
      <button type="submit" disabled={submitting}
        className="w-full px-6 py-3 rounded-xl bg-accent-success hover:bg-accent-success text-on-dark text-sm font-semibold disabled:opacity-60 transition-colors">
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
