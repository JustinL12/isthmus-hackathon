"use client";

import { useState } from "react";
import { money } from "@/lib/plan-math";

export function BudgetBar({
  total,
  budget,
  ownerName,
  onBudgetChange,
}: {
  total: number;
  budget: number | null;
  ownerName?: string;
  onBudgetChange?: (budget: number) => void;
}) {
  // Local text so the owner can clear the field while typing.
  const [draft, setDraft] = useState(budget == null ? "" : String(budget));

  const over = budget != null && total > budget;
  const pct = budget ? Math.min(100, (total / budget) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink/80">{ownerName ? `${ownerName}'s budget today` : "Budget today"}</span>
        {onBudgetChange ? (
          <label className="flex items-center font-semibold text-ink">
            $
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft}
              placeholder="Add"
              aria-label="Budget today in dollars"
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && n >= 0) onBudgetChange(n);
              }}
              style={{ width: `${Math.max(draft.length, 3) + 1}ch` }}
              className="rounded bg-transparent outline-none [appearance:textfield] focus:bg-cream [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
        ) : (
          <span className="font-semibold text-ink">{budget ? money(budget) : "—"}</span>
        )}
      </div>
      {budget ? (
        <>
          <div className="h-2 rounded-full bg-line">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${over ? "bg-bad" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={`text-sm font-medium ${over ? "text-bad" : "text-good"}`}>
            {over ? `${money(total - budget)} over budget` : `${money(budget - total)} under budget`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Add a budget to compare against today&apos;s total.</p>
      )}
    </div>
  );
}
