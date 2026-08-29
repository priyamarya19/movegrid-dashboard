"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { dateIN } from "@/lib/format";

type Message = {
  id: string;
  author: "rider" | "ops" | "system";
  author_name: string | null;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  kind: "message" | "close_request" | "close_approved" | "close_declined" | "auto_closed";
  created_at: string;
};

type Ticket = {
  id: string;
  message: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  status: "open" | "pending_closure" | "resolved";
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  close_requested_at: string | null;
  close_requested_by: string | null;
  age_hours: number;
  rider_id: string;
  rider_name: string;
  rider_code: string | null;
  mobile: string;
  ev_number: string | null;
  messages: Message[];
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
  async function send(t: Ticket, action: "reply" | "resolve" | "request_close") {
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
      action === "resolve"
        ? `Closed · ${t.rider_name} notified`
        : action === "request_close"
          ? `Asked ${t.rider_name} to confirm — closes when they say yes`
          : `Replied to ${t.rider_name} — still open`,
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
          {openCount} needing attention · closed tickets from the last 7 days shown for context
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
                  ) : t.status === "pending_closure" ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-purple/15 text-accent-purple">
                      Waiting on rider
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

              {/* The conversation, in order. Rider on the left, ops on the
                  right, the way every messaging app the riders already use
                  reads — and the state changes sit inline as their own lines,
                  so "who closed this and when" is answered by reading down. */}
              <div className="space-y-2">
                {(t.messages?.length ? t.messages : [
                  { id: t.id, author: "rider" as const, author_name: null, body: t.message,
                    media_url: t.media_url, media_type: t.media_type, kind: "message" as const,
                    created_at: t.created_at },
                ]).map((m) => {
                  if (m.kind !== "message") {
                    const label =
                      m.kind === "close_request" ? `${m.author_name ?? "Ops"} asked to close this`
                      : m.kind === "close_approved" ? "Rider confirmed it is sorted"
                      : m.kind === "close_declined" ? "Rider said it is not sorted yet"
                      : "Closed automatically — no reply";
                    return (
                      <div key={m.id} className="flex items-center gap-2 py-1">
                        <div className="h-px flex-1 bg-subtle" />
                        <span className="text-faint text-[11px] px-2 text-center">
                          {label}
                          {m.body ? ` — “${m.body}”` : ""}
                        </span>
                        <div className="h-px flex-1 bg-subtle" />
                      </div>
                    );
                  }
                  const mine = m.author === "ops";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        mine ? "bg-accent-teal/12 border border-accent-teal/25" : "bg-base border border-subtle"
                      }`}>
                        <p className="text-[11px] text-muted">
                          {mine ? m.author_name ?? "Ops" : t.rider_name}
                          <span className="text-faint"> · {dateIN(m.created_at, { day: "numeric", month: "short" })}</span>
                        </p>
                        {m.body ? <p className="text-primary text-sm mt-1 whitespace-pre-wrap">{m.body}</p> : null}
                        {m.media_url ? (
                          m.media_type === "video" ? (
                            <video src={docHref(m.media_url)} controls className="rounded-xl max-h-72 border border-default mt-2" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={docHref(m.media_url)} alt="Attachment" className="rounded-xl max-h-72 border border-default mt-2" />
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {t.status !== "resolved" ? (
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
                      {/* Closing is the rider's word, so the normal path asks
                          them. "Close without asking" stays for duplicates and
                          riders who have gone quiet for good. */}
                      <button
                        onClick={() => send(t, "request_close")}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 disabled:opacity-50"
                      >
                        Ask rider to close
                      </button>
                      <button
                        onClick={() => send(t, "resolve")}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-default text-secondary hover:text-primary disabled:opacity-50"
                      >
                        Close without asking
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
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setReplyingId(t.id);
                        setNote("");
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25 transition-colors"
                    >
                      Reply
                    </button>
                    {t.status === "pending_closure" ? (
                      <span className="text-faint text-xs">
                        Asked {t.close_requested_by ? `by ${t.close_requested_by}` : ""}
                        {t.close_requested_at ? ` on ${dateIN(t.close_requested_at, { day: "numeric", month: "short" })}` : ""}
                        {" "}· closes on its own after 7 days of silence
                      </span>
                    ) : null}
                  </div>
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
