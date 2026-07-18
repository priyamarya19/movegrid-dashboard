"use client";

import { useState } from "react";
import PaymentsReceived from "@/components/collections/PaymentsReceived";

// Wraps the existing Collections overview and, for users with the can_view_allotments
// permission, a second "Payments received" tab (the collections log). The overview is
// rendered on the server and passed in as a slot so it isn't re-implemented here.
export default function CollectionsTabs({ overview, canViewPayments }: { overview: React.ReactNode; canViewPayments: boolean }) {
  const [tab, setTab] = useState<"overview" | "payments">("overview");

  if (!canViewPayments) return <>{overview}</>;

  const tabCls = (active: boolean) =>
    `px-4 py-2 rounded-xl text-sm font-medium transition-colors ${active ? "bg-accent-teal/15 text-accent-teal" : "text-muted hover:text-primary hover:bg-overlay-hover"}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-default pb-3">
        <button className={tabCls(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button className={tabCls(tab === "payments")} onClick={() => setTab("payments")}>Payments received</button>
      </div>
      {tab === "overview" ? overview : <PaymentsReceived />}
    </div>
  );
}
