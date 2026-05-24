"use client";

import { useState } from "react";

type Comment = {
  id: string;
  author_name: string;
  author_role: string;
  comment: string;
  created_at: string;
};

const roleLabel: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops Manager",
  hub_incharge: "Hub Incharge",
};

const statusColor: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  contacted: "bg-yellow-500/20 text-yellow-400",
  converted: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const quickNotes = [
  "Called — no answer",
  "Called — asked to call back later",
  "Sent WhatsApp message",
  "Interested — needs more info",
  "Not interested",
  "Will visit office",
  "Converted to customer",
];

function timeStr(date: string) {
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

type Props = {
  leadId: string;
  initialStatus: string;
  statusOptions: string[];
  initialComments: Comment[];
};

export default function LeadComments({ leadId, initialStatus, statusOptions, initialComments }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const addComment = async (commentText?: string) => {
    const body = commentText ?? text.trim();
    if (!body) return;
    setSubmitting(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: body }),
    });
    if (res.ok) {
      const newComment = await res.json();
      setComments(prev => [...prev, newComment]);
      if (!commentText) setText("");
    }
    setSubmitting(false);
  };

  const updateStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setStatus(newStatus);
    setUpdatingStatus(false);
  };

  return (
    <div className="space-y-6">
      {/* Status updater */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map((s) => (
          <button key={s} disabled={updatingStatus} onClick={() => updateStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize border transition-all
              ${status === s
                ? (statusColor[s] ?? "bg-gray-500/20 text-gray-400") + " border-transparent"
                : "border-[#1e1e2e] text-[#555] hover:text-white"
              }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Comments timeline */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-white font-semibold">Activity & Notes</h2>
          <span className="text-[#555] text-xs">{comments.length} note{comments.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="divide-y divide-[#1a1a2a] max-h-80 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="px-5 py-8 text-center text-[#555] text-sm">No notes yet. Add the first one below.</p>
          ) : comments.map((c) => (
            <div key={c.id} className="px-5 py-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#6C5CE720] flex items-center justify-center text-[#6C5CE7] text-[10px] font-bold shrink-0">
                    {c.author_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[#aaa] text-xs font-medium">{c.author_name}</span>
                  <span className="text-[#444] text-xs">{roleLabel[c.author_role] ?? c.author_role}</span>
                </div>
                <span className="text-[#444] text-xs shrink-0">{timeStr(c.created_at)}</span>
              </div>
              <p className="text-[#ccc] text-sm ml-8 leading-relaxed">{c.comment}</p>
            </div>
          ))}
        </div>

        {/* Quick notes */}
        <div className="px-5 py-3 border-t border-[#1e1e2e] border-b">
          <p className="text-[#555] text-xs mb-2">Quick notes</p>
          <div className="flex flex-wrap gap-1.5">
            {quickNotes.map((note) => (
              <button key={note} onClick={() => addComment(note)} disabled={submitting}
                className="px-2.5 py-1 rounded-lg text-xs text-[#555] border border-[#1e1e2e] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors">
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Add note */}
        <div className="px-5 py-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Add a note — what happened on this call?"
            rows={3}
            className="w-full bg-[#0A0A0F] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm text-[#ccc] placeholder-[#444] resize-none focus:outline-none focus:border-[#6C5CE7] transition-colors"
          />
          <div className="flex justify-end mt-2">
            <button onClick={() => addComment()} disabled={submitting || !text.trim()}
              className="px-4 py-2 bg-[#6C5CE7] text-white text-sm font-medium rounded-xl hover:bg-[#5a4bd1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {submitting ? "Saving..." : "Add Note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
