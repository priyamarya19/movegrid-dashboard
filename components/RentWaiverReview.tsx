"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { dateIN } from "@/lib/format";

type WaiverRequest = {
  id: string;
  non_functional_days: number;
  reason: string | null;
  requested_by: string | null;
  requested_at: string;
  rider_id: string;
  rider_name: string;
  rider_code: string;
  ev_number: string;
};

export default function RentWaiverReview() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<WaiverRequest[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = () => {
    fetch("/api/rent-waivers").then(async (r) => {
      if (r.status === 403) { setForbidden(true); setRows([]); return; }
      setRows(await r.json());
    });
  };

  useEffect(load, []);

  async function act(id: string, action: "approve" | "reject") {
    const row = rows?.find((r) => r.id === id);
    const days = row?.non_functional_days ?? 0;
    const ok = await confirm({
      title: action === "approve" ? "Approve this rent waiver?" : "Reject this rent waiver?",
      message: action === "approve"
        ? `${row?.rider_name ?? "The rider"} will be credited ${days} non-functional day${days !== 1 ? "s" : ""} of rent.`
        : `${row?.rider_name ?? "The rider"}'s waiver request will be dismissed and full rent stays owed.`,
      confirmLabel: action === "approve" ? "Approve" : "Reject",
      danger: action === "reject",
    });
    if (!ok) return;
    setActingOn(id);
    try {
      const res = await fetch(`/api/rent-waivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
        toast.show(action === "approve" ? "Waiver approved" : "Waiver rejected", "success");
      } else {
        const msg = await res.json().catch(() => ({}));
        toast.show(msg.error || `Couldn't ${action} the waiver`, "error");
      }
    } catch {
      toast.show(`Couldn't ${action} the waiver. Try again.`, "error");
    } finally {
      setActingOn(null);
    }
  }

  if (forbidden) {
    return (
      <div className="bg-surface border border-default rounded-xl p-6 text-center">
        <p className="text-primary font-semibold">You don't have access to approve rent waivers</p>
        <p className="text-muted text-sm mt-1">Ask an admin to grant this in Settings if you need it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Rent Waiver Requests</h1>
        <p className="text-muted text-sm mt-1">
          Waivers applied by the team and non-functional-day credits from issue-based swaps — full rent shows owed until you approve.
        </p>
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Vehicle", "Days Requested", "Reason", "Requested By", "Requested At", "Action"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No pending requests</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3.5">
                    <Link href={`/riders/${r.rider_id}`} className="text-accent-purple hover:underline font-medium">{r.rider_name}</Link>
                    <p className="text-faint text-xs">{r.rider_code}</p>
                  </td>
                  <td className="px-5 py-3.5 text-secondary">{r.ev_number}</td>
                  <td className="px-5 py-3.5 text-primary font-semibold">{r.non_functional_days} day{r.non_functional_days !== 1 ? "s" : ""}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs max-w-[220px] truncate" title={r.reason ?? undefined}>
                    {r.reason ?? <span className="text-faint">Issue-swap credit</span>}
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{r.requested_by ?? "—"}</td>
                  <td className="px-5 py-3.5 text-muted text-xs whitespace-nowrap">
                    {dateIN(r.requested_at, { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => act(r.id, "approve")}
                        disabled={actingOn === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-success/15 text-accent-success-text hover:bg-accent-success/25 disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => act(r.id, "reject")}
                        disabled={actingOn === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-danger-alt/15 text-accent-danger-alt-text hover:bg-accent-danger-alt/25 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
