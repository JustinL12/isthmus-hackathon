"use client";

import type { PlanItem } from "@/lib/types";
import { money } from "@/lib/plan-math";

/** One estimate line: checkbox, name + plain-language "what", "if postponed" note, price. */
export function ItemCard({
  item,
  onToggle,
  detailsAlwaysVisible = false,
}: {
  item: PlanItem;
  onToggle?: () => void;
  /** Show the "if postponed" note (shared decision screen). */
  detailsAlwaysVisible?: boolean;
}) {
  return (
    <div
      className={`@container flex items-center gap-4 rounded-xl border border-line px-4 py-3 transition-colors ${
        item.selected ? "bg-white" : "bg-white/60"
      }`}
    >
      {onToggle && (
        <input
          type="checkbox"
          checked={item.selected}
          onChange={onToggle}
          aria-label={`Do ${item.name} today`}
          className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
        />
      )}
      <div className="min-w-0 flex-1 @xl:grid @xl:grid-cols-2 @xl:gap-6">
        <div>
          <p className="font-semibold text-ink">{item.name}</p>
          <p className="text-sm text-slate">{item.explanation?.what ?? "Ask your vet what this covers."}</p>
          {item.vet_note && <p className="mt-1 text-sm italic text-muted">Vet note: {item.vet_note}</p>}
        </div>
        {detailsAlwaysVisible && (
          <div className="mt-2 @xl:mt-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">If postponed</p>
            <p className="text-sm text-ink/80">
              {item.explanation?.if_postponed ?? "Ask your vet whether this can safely wait."}
            </p>
          </div>
        )}
      </div>
      <span className="shrink-0 text-lg font-semibold text-ink">{money(item.price)}</span>
    </div>
  );
}
