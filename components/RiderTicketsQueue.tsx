"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { dateIN } from "@/lib/format";

type Ticket = {
  id: string;
  message: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  status: "open" | "resolved";
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  age_hours: number;
  rider_id: string;
  rider_name: string;
  rider_code: string | null;
  mobile: string;
  ev_number: string | null;
};

// Support queue. Open tickets sit at the top, oldest first, so the rider who
// has waited longest is dealt with first rather than whoever complained last.
export default function RiderTicketsQueue() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/rider-tickets")
      .then((r) => r.json())
      .then((d) => {
        setTickets(d.tickets ?? []);
        setOpenCount(d.open ?? 0);
      });

  useEffect(() => {
    load();
  }, []);

  // Reply and resolve were one button, so every answer closed the ticket. They
  // are two decisions: "here is what we found" and "this is finished".
  async function send(t: Ticket, action: "reply" | "resolve") {
    if (note.trim().length < 3) {
      toast.show("Add a note — the rider sees this", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/rider-tickets/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, resolution_note: note.trim() }),
    });
    setSaving(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.show(j.error || "Couldn't send that", "error");
      return;
    }
    toast.show(
      action === "resolve" ? `Resolved · ${t.rider_name} notified` : `Replied to ${t.rider_name} — still open`,
      "success"
    );
    setReplyingId(null);
    setNote("");
    load();
  }

  async function reopen(t: Ticket) {
    const res = await fetch(`/api/rider-tickets/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    if (res.ok) {
      toast.show("Reopened", "success");
      load();
    }
  }

  const docHref = (key: string) => `/api/file?key=${encodeURIComponent(key)}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Rider Support</h1>
        <p className="text-muted text-sm mt-1">
          {openCount} open{openCount === 1 ? "" : ""} · resolved tickets from the last 7 days shown for context
        </p>
      </div>

      {tickets === null ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="bg-surface border border-default rounded-2xl p-10 text-center text-muted">
          No support requests. Riders can raise one from the app once they have a scooter.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div
              key={t.id}
              className={`bg-surface border rounded-2xl p-5 space-y-3 ${
                t.status === "open" ? "border-accent-warning/40" : "border-default"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/riders/${t.rider_id}`} className="text-accent-purple hover:underline font-semibold">
                    {t.rider_name}
                  </Link>
                  <p className="text-faint text-xs mt-0.5">
                    {t.rider_code ?? "—"} · {t.mobile}
                    {t.ev_number ? ` · ${t.ev_number}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.status === "open" ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        t.age_hours >= 24
                          ? "bg-accent-danger-alt/15 text-accent-danger-alt-text"
                          : "bg-accent-warning/15 text-accent-warning-text"
                      }`}
                    >
                      {t.age_hours < 1 ? "just now" : `${t.age_hours}h waiting`}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-success/15 text-accent-success-text">
                      Resolved
                    </span>
                  )}
                  <span className="text-faint text-xs">
                    {dateIN(t.created_at, { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>

              <p className="text-primary text-sm whitespace-pre-wrap">{t.message}</p>

              {t.media_url ? (
                t.media_type === "video" ? (
                  <video src={docHref(t.media_url)} controls className="rounded-xl max-h-72 border border-default" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={docHref(t.media_url)} alt="Attachment" className="rounded-xl max-h-72 border border-default" />
                )
              ) : null}

              {t.resolution_note ? (
                <div className="bg-base border border-subtle rounded-xl p-3">
                  <p className="text-[11px] text-muted uppercase tracking-wider">
                    Reply{t.resolved_by ? ` · ${t.resolved_by}` : ""}
                  </p>
                  <p className="text-secondary text-sm mt-1 whitespace-pre-wrap">{t.resolution_note}</p>
                </div>
              ) : null}

              {t.status === "open" ? (
                replyingId === t.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="What did you do about it? The rider reads this."
                      className="w-full bg-base border border-default rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-teal"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => send(t, "reply")}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-teal text-on-dark disabled:opacity-50"
                      >
                        {saving ? "Sending…" : "Send reply"}
                      </button>
                      <button
                        onClick={() => send(t, "resolve")}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-default text-secondary hover:text-primary disabled:opacity-50"
                      >
                        Reply & resolve
                      </button>
                      <button
                        onClick={() => {
                          setReplyingId(null);
                          setNote("");
                        }}
                        className="text-xs text-muted hover:text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setReplyingId(t.id);
                      setNote("");
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25 transition-colors"
                  >
                    Reply
                  </button>
                )
              ) : (
                <button onClick={() => reopen(t)} className="text-xs text-muted hover:text-primary underline">
                  Reopen
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
