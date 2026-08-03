"use client";

import { useState } from "react";
import FinanceSummary from "@/components/finance/FinanceSummary";
import BadDebtTab from "@/components/finance/BadDebtTab";

// Finance: the existing summary plus the Bad Debt register.
export default function FinanceTabs() {
  const [tab, setTab] = useState<"overview" | "bad_debt">("overview");

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-surface border border-default rounded-xl p-1 w-fit">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "bad_debt", label: "Bad Debt" },
          ] as const
        ).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.key ? "bg-accent-teal/15 text-accent-teal" : "text-muted hover:text-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? <FinanceSummary /> : <BadDebtTab />}
    </div>
  );
}
