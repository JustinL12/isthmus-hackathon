"use client";

import type { PlanItem } from "@/lib/types";
import { money } from "@/lib/plan-math";

/** One estimate line: checkbox, name + plain-language "what", "if postponed" note, price. */
export function ItemCard({
  item,
  onToggle,
  detailsAlwaysVisible = false,
  onExpand,
}: {
  item: PlanItem;
  onToggle?: () => void;
  /** Show the "if postponed" note (shared decision screen). */
  detailsAlwaysVisible?: boolean;
  /** Show an expand button; gets the card's vertical center so the details view can grow from it. */
  onExpand?: (originY: number) => void;
}) {
  return (
    <div
      data-item-card
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
      {onExpand && (
        <button
          type="button"
          // Don't let a press on the button start a drag of the card.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            const card = event.currentTarget.closest("[data-item-card]")!.getBoundingClientRect();
            onExpand(card.top + card.height / 2);
          }}
          aria-label={`More about ${item.name}`}
          aria-haspopup="dialog"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted transition hover:scale-105 hover:border-ink/30 hover:text-ink motion-reduce:transition-none"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
