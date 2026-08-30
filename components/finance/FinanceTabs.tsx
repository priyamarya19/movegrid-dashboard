"use client";

import { useState } from "react";
import FinanceSummary from "@/components/finance/FinanceSummary";
import BadDebtTab from "@/components/finance/BadDebtTab";
import WriteOffsTab from "@/components/finance/WriteOffsTab";

// Finance: the summary, the Bad Debt register, and write-offs.
//
// Bad debt and write-offs are separate tabs on purpose. One is riders who owed
// and did not pay; the other is revenue we never properly billed and chose to
// absorb. Mixing them would put reliable riders on a defaulter list.
export default function FinanceTabs() {
  const [tab, setTab] = useState<"overview" | "bad_debt" | "write_offs">("overview");

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-surface border border-default rounded-xl p-1 w-fit">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "bad_debt", label: "Bad Debt" },
            { key: "write_offs", label: "Write-offs" },
          ] as const
        ).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.key ? "bg-accent-teal/15 text-accent-teal" : "text-muted hover:text-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? <FinanceSummary /> : tab === "bad_debt" ? <BadDebtTab /> : <WriteOffsTab />}
    </div>
  );
}
