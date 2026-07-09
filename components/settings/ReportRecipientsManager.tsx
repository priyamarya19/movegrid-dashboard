"use client";

import { useState, useEffect, useMemo } from "react";

type Recipient = { id: string; report_key: string; email: string; enabled: boolean };

const REPORTS = [
  { key: "fleet_status", label: "Fleet & Rider Rent Status", hint: "Excel, daily 6:30 PM" },
  { key: "rent_due", label: "Rent Due Alert", hint: "Email, daily 9:00 AM" },
];

export default function ReportRecipientsManager() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newChecks, setNewChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/settings/report-recipients")
      .then((r) => r.json())
      .then(setRecipients)
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const r of recipients) {
      map[r.email] ??= {};
      map[r.email][r.report_key] = r.enabled;
    }
    return map;
  }, [recipients]);

  const emails = Object.keys(grouped).sort();

  async function toggle(email: string, report_key: string, enabled: boolean) {
    setRecipients((prev) => {
      const existing = prev.find((r) => r.email === email && r.report_key === report_key);
      if (existing) return prev.map((r) => (r === existing ? { ...r, enabled } : r));
      return [...prev, { id: `${email}:${report_key}`, report_key, email, enabled }];
    });
    await fetch("/api/settings/report-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, report_key, enabled }),
    });
  }

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    const checked = REPORTS.filter((r) => newChecks[r.key]).map((r) => r.key);
    for (const key of checked.length ? checked : [REPORTS[0].key]) {
      await toggle(email, key, true);
    }
    setNewEmail("");
    setNewChecks({});
  }

  async function removeEmail(email: string) {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
    await fetch(`/api/settings/report-recipients?email=${encodeURIComponent(email)}`, { method: "DELETE" });
  }

  return (
    <div className="bg-surface border border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-default">
        <h2 className="text-primary font-semibold">Report Recipients</h2>
        <p className="text-muted text-xs mt-1">Choose which daily reports go to which email addresses</p>
      </div>

      <form onSubmit={addEmail} className="px-5 py-4 border-b border-default flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          placeholder="ops@movegrid.in"
          className="flex-1 min-w-[220px] bg-base border border-default rounded-xl px-4 py-2 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-success transition-colors"
        />
        {REPORTS.map((r) => (
          <label key={r.key} className="flex items-center gap-1.5 text-xs text-secondary whitespace-nowrap">
            <input
              type="checkbox"
              checked={!!newChecks[r.key]}
              onChange={(e) => setNewChecks((p) => ({ ...p, [r.key]: e.target.checked }))}
              className="accent-accent-success"
            />
            {r.label}
          </label>
        ))}
        <button
          type="submit"
          className="bg-accent-success hover:bg-accent-success text-primary text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Add
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default">
              <th className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">Email</th>
              {REPORTS.map((r) => (
                <th key={r.key} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">
                  {r.label}
                  <span className="block normal-case text-[10px] text-faint font-normal">{r.hint}</span>
                </th>
              ))}
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={REPORTS.length + 2} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan={REPORTS.length + 2} className="px-5 py-10 text-center text-muted">No recipients yet</td></tr>
            ) : emails.map((email) => (
              <tr key={email} className="border-b border-subtle hover:bg-overlay-hover">
                <td className="px-5 py-3.5 text-primary text-xs whitespace-nowrap">{email}</td>
                {REPORTS.map((r) => (
                  <td key={r.key} className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={!!grouped[email][r.key]}
                      onChange={(e) => toggle(email, r.key, e.target.checked)}
                      className="accent-accent-success w-4 h-4"
                    />
                  </td>
                ))}
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-xs font-medium text-muted hover:text-accent-danger-alt-text transition-colors whitespace-nowrap"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
