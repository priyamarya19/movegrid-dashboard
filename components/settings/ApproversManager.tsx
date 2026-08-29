"use client";

import { useCallback, useEffect, useState } from "react";

type Row = { id: string; name: string; email: string; role: string | null; actions: string[] };

const LABELS: Record<string, string> = {
  rider_edit: "Rider edits",
  allotment_start_date: "Rent start date",
};

/**
 * Who can authorise the actions ops can't take alone.
 *
 * Approval codes go out by email, so an approver needs a working address — the
 * screen says so rather than letting a code vanish silently.
 */
export default function ApproversManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/settings/approvals")
      .then((r) => r.json())
      .then((d) => { setRows(d.users ?? []); setActions(d.actions ?? []); setLoaded(true); })
      .catch(() => setError("Could not load approvers"));
  }, []);
  useEffect(load, [load]);

  async function toggle(user: Row, action: string) {
    const next = user.actions.includes(action)
      ? user.actions.filter((a) => a !== action)
      : [...user.actions, action];
    setSaving(user.id);
    setError("");
    try {
      const res = await fetch("/api/settings/approvals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, actions: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Could not save"); return; }
      load();
    } finally {
      setSaving(null);
    }
  }

  const approverCount = rows.filter((r) => r.actions.length).length;

  return (
    <section className="bg-surface border border-default rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-primary font-semibold">Approvals</h2>
        <p className="text-muted text-sm mt-1">
          Some actions need a second pair of eyes. Ops raise the request, whoever is ticked here is
          emailed a code, and they read it back for ops to type in.
        </p>
      </div>

      {loaded && approverCount === 0 ? (
        <p className="text-accent-danger-alt-text text-sm">
          Nobody can approve anything right now, so every gated action is blocked. Tick at least one person.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase tracking-wider">
              <th className="text-left py-2">Person</th>
              {actions.map((a) => <th key={a} className="text-center py-2 px-3">{LABELS[a] ?? a}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-subtle">
                <td className="py-2.5">
                  <div className="text-primary">{u.name}</div>
                  <div className="text-muted text-xs">{u.email} · {u.role ?? "—"}</div>
                </td>
                {actions.map((a) => (
                  <td key={a} className="text-center px-3">
                    <input
                      type="checkbox"
                      checked={u.actions.includes(a)}
                      disabled={saving === u.id}
                      onChange={() => toggle(u, a)}
                      className="w-4 h-4 accent-[var(--accent-purple)] cursor-pointer disabled:opacity-40"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-accent-danger-alt-text text-sm">{error}</p> : null}
      <p className="text-faint text-xs">
        Codes are emailed, so an approver needs an address that actually receives mail.
      </p>
    </section>
  );
}
