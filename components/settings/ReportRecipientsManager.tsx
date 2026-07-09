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
    <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e1e2e]">
        <h2 className="text-white font-semibold">Report Recipients</h2>
        <p className="text-[#666] text-xs mt-1">Choose which daily reports go to which email addresses</p>
      </div>

      <form onSubmit={addEmail} className="px-5 py-4 border-b border-[#1e1e2e] flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          placeholder="ops@movegrid.in"
          className="flex-1 min-w-[220px] bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C48C] transition-colors"
        />
        {REPORTS.map((r) => (
          <label key={r.key} className="flex items-center gap-1.5 text-xs text-[#aaa] whitespace-nowrap">
            <input
              type="checkbox"
              checked={!!newChecks[r.key]}
              onChange={(e) => setNewChecks((p) => ({ ...p, [r.key]: e.target.checked }))}
              className="accent-[#00C48C]"
            />
            {r.label}
          </label>
        ))}
        <button
          type="submit"
          className="bg-[#00C48C] hover:bg-[#00E0A0] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Add
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              <th className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">Email</th>
              {REPORTS.map((r) => (
                <th key={r.key} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">
                  {r.label}
                  <span className="block normal-case text-[10px] text-[#444] font-normal">{r.hint}</span>
                </th>
              ))}
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={REPORTS.length + 2} className="px-5 py-10 text-center text-[#555]">Loading...</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan={REPORTS.length + 2} className="px-5 py-10 text-center text-[#555]">No recipients yet</td></tr>
            ) : emails.map((email) => (
              <tr key={email} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                <td className="px-5 py-3.5 text-white text-xs whitespace-nowrap">{email}</td>
                {REPORTS.map((r) => (
                  <td key={r.key} className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={!!grouped[email][r.key]}
                      onChange={(e) => toggle(email, r.key, e.target.checked)}
                      className="accent-[#00C48C] w-4 h-4"
                    />
                  </td>
                ))}
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-xs font-medium text-[#555] hover:text-red-400 transition-colors whitespace-nowrap"
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
