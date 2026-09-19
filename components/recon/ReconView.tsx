"use client";

import { useRef, useState } from "react";

type Admin = { id: string; name: string | null; email: string };
type Totals = {
  bookEntries: number; bookAmount: number;
  creditCount: number; creditAmount: number;
  matchedCount: number; matchedAmount: number;
  byUtr: number; byName: number; byAmountDate: number; bySplit: number;
  riderTypeBank: number; difference: number;
  unmatchedCount: number; unmatchedAmount: number;
  unmatchedCreditCount: number; unmatchedCreditAmount: number;
};
type RunResult = {
  token: string; filename: string; expiresInMinutes: number;
  statement: { from: string; to: string; accountTail: string | null; credits: number; totalCredited: number; transactions: number };
  totals: Totals;
  categories: { category: string; count: number; amount: number }[];
  warnings: string[];
  outsidePeriod: number;
  admins: Admin[];
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dmy = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const ctl = "bg-base border border-default rounded-xl px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-teal transition-colors";
const btn = "rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

export default function ReconView() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function doRun() {
    if (!file) { setError("Attach the bank statement first."); return; }
    setBusy(true); setError(null); setRun(null); setSent(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("from", from);
      fd.append("to", to);
      const res = await fetch("/api/recon/run", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "That did not work."); return; }
      setRun(json);
      // Everyone ticked by default — sending to all the founders is the common
      // case, and unticking someone is easier than finding them.
      setPicked(new Set((json.admins as Admin[]).map((a) => a.id)));
    } catch {
      setError("The reconciliation could not be run. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doSend() {
    if (!run || !picked.size) return;
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/recon/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: run.token, userIds: [...picked] }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "The email could not be sent."); return; }
      setSent(json.recipients);
    } catch {
      setError("The email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const t = run?.totals;
  const ahead = (t?.difference ?? 0) >= 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Recon</h1>
        <p className="text-muted text-sm mt-1">
          Match the payment book against a bank statement. Nothing is stored — the result is held for
          a few minutes so you can download it and send it on.
        </p>
      </div>

      {/* Inputs */}
      <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Payments from</label>
            <input type="date" className={ctl} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">to</label>
            <input type="date" className={ctl} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Bank statement</label>
            <input
              ref={fileInput}
              type="file"
              accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className={`${ctl} w-full file:mr-3 file:rounded-lg file:border-0 file:bg-overlay-hover file:px-3 file:py-1 file:text-primary file:text-xs`}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            />
          </div>
          <button className={`${btn} bg-accent-purple text-white hover:opacity-90`} onClick={doRun} disabled={busy}>
            {busy ? "Reconciling…" : "Reconcile"}
          </button>
        </div>
        <p className="text-faint text-xs">
          Upload the statement exactly as the bank exports it — .xls, .xlsx or .csv. Up to 10 MB.
        </p>
      </div>

      {error && (
        <div className="border border-accent-red/40 bg-accent-red/10 text-primary rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {run && t && (
        <>
          {/* Bottom line */}
          <div className="bg-surface border border-default rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-default flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-primary font-semibold text-[15px]">The bottom line</h2>
              <span className="text-xs text-muted">
                Account ending {run.statement.accountTail ?? "—"} · statement {dmy(run.statement.from)} – {dmy(run.statement.to)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-default">
              {[
                { lbl: "Rider money in the bank", val: inr(t.riderTypeBank), note: "matched plus unmatched rider-sized credits" },
                { lbl: "Recorded in the ops book", val: inr(t.bookAmount), note: `${t.bookEntries} entries` },
                {
                  lbl: ahead ? "Bank ahead of the book" : "Book ahead of the bank",
                  val: inr(Math.abs(t.difference)),
                  note: ahead ? "arrived but never entered against a rider" : "recorded but not received",
                  hot: true,
                },
              ].map((x) => (
                <div key={x.lbl} className="p-5">
                  <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{x.lbl}</div>
                  <div className={`text-2xl font-bold mt-1.5 tabular-nums ${x.hot ? "text-accent-purple" : "text-primary"}`}>{x.val}</div>
                  <div className="text-faint text-[11.5px] mt-1">{x.note}</div>
                </div>
              ))}
            </div>
          </div>

          {run.warnings.length > 0 && (
            <div className="border border-accent-amber/40 bg-accent-amber/10 rounded-xl px-4 py-3 text-sm text-primary space-y-1">
              {run.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {/* Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-surface border border-default rounded-xl p-5">
              <h3 className="text-primary font-semibold text-sm mb-3">Matching</h3>
              <dl className="text-sm space-y-2">
                {[
                  ["Matched", `${t.matchedCount} · ${inr(t.matchedAmount)}`],
                  ["— by UTR (exact)", String(t.byUtr)],
                  ["— by payer name", String(t.byName)],
                  ["— by amount and date only", String(t.byAmountDate)],
                  ["— paid in instalments", String(t.bySplit)],
                  ["Ops entries unmatched", `${t.unmatchedCount} · ${inr(t.unmatchedAmount)}`],
                  ["Bank credits unmatched", `${t.unmatchedCreditCount} · ${inr(t.unmatchedCreditAmount)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className={k.startsWith("—") ? "text-muted pl-3" : "text-secondary"}>{k}</dt>
                    <dd className="text-primary tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="bg-surface border border-default rounded-xl p-5">
              <h3 className="text-primary font-semibold text-sm mb-3">Unmatched bank credits</h3>
              {run.categories.length === 0 ? (
                <p className="text-muted text-sm">Every credit was accounted for.</p>
              ) : (
                <dl className="text-sm space-y-2">
                  {run.categories.map((c) => (
                    <div key={c.category} className="flex justify-between gap-4">
                      <dt className="text-secondary">{c.category}</dt>
                      <dd className="text-primary tabular-nums whitespace-nowrap">{c.count} · {inr(c.amount)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          {/* Download + send */}
          <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <a className={`${btn} bg-accent-teal text-black hover:opacity-90 inline-block`}
                 href={`/api/recon/download?token=${encodeURIComponent(run.token)}`}>
                Download workbook
              </a>
              <span className="text-faint text-xs">
                {run.filename} · available for {run.expiresInMinutes} minutes, then it is gone
              </span>
            </div>

            <div className="border-t border-default pt-4">
              <h3 className="text-primary font-semibold text-sm mb-1">Send it to</h3>
              <p className="text-muted text-xs mb-3">Everyone is ticked — untick anyone who should not get the bank statement.</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {run.admins.map((a) => {
                  const on = picked.has(a.id);
                  return (
                    <label key={a.id}
                      className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
                        on ? "border-accent-purple bg-accent-purple/10 text-primary" : "border-default text-secondary"}`}>
                      <input type="checkbox" className="accent-current" checked={on} onChange={() => {
                        const next = new Set(picked);
                        if (on) next.delete(a.id); else next.add(a.id);
                        setPicked(next);
                      }} />
                      <span>{a.name || a.email}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className={`${btn} bg-accent-purple text-white hover:opacity-90`}
                        onClick={doSend} disabled={sending || !picked.size || !!sent}>
                  {sending ? "Sending…" : sent ? "Sent" : `Send to ${picked.size}`}
                </button>
                {sent && <span className="text-accent-teal text-sm">Sent to {sent.join(", ")}.</span>}
              </div>
              {sent && (
                <p className="text-faint text-xs mt-2">
                  The result has now been discarded. Run it again if you need another copy.
                </p>
              )}
            </div>
          </div>

          <p className="text-faint text-xs leading-relaxed max-w-[75ch]">
            Line-by-line matching will not close this book completely, and that is expected rather than a
            fault: riders pay a week&rsquo;s rent in instalments while ops record one completed week, so a single
            entry often corresponds to several credits. Where two credits fitted an entry equally well, no
            match was made — an honest gap beats a wrong name against a rupee figure. Judge it on the bottom
            line, not the matched count.
          </p>
        </>
      )}
    </div>
  );
}
