"use client";

import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/plan-math";
import type { PlanItem } from "@/lib/types";

// Expanded view of one estimate item. Template only for now: each section shows a
// placeholder until real content is passed in through `details`.
//
// TODO(item details): pass content per section, e.g.
//   <ItemDetailsDialog details={{ procedure: <p>…</p>, cost: <CostTable … /> }} … />
// Any section left out keeps its placeholder, so they can be filled in one at a time.

export type ItemDetailSection = "procedure" | "why" | "postpone" | "cost" | "questions";

export const ITEM_DETAIL_SECTIONS: { id: ItemDetailSection; title: (pet: string) => string; hint: string }[] = [
  { id: "procedure", title: () => "What happens", hint: "What the vet does, step by step, and how long it takes" },
  { id: "why", title: (pet) => `Why it matters for ${pet}`, hint: "How this helps find or treat the problem" },
  { id: "postpone", title: () => "If you wait", hint: "What could change if it's postponed, and signs to watch for" },
  { id: "cost", title: () => "Cost breakdown", hint: "What the price includes" },
  { id: "questions", title: () => "Questions to ask your vet", hint: "Prompts to bring up together" },
];

export function ItemDetailsDialog({
  item,
  petName,
  groupLabel,
  toneClassName,
  originY,
  details = {},
  onClose,
}: {
  item: PlanItem;
  petName: string;
  groupLabel: string;
  /** Group chip colors, e.g. GROUP_TONE[item.group]. */
  toneClassName: string;
  /** Vertical center of the card that opened this, so the panel grows out from it. */
  originY: number;
  details?: Partial<Record<ItemDetailSection, ReactNode>>;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = `item-details-${item.id}`;

  // Focus inside while open, Escape closes, the page behind doesn't scroll, and focus
  // returns to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose]);

  const fromCard = (originY - window.innerHeight / 2) * 0.35;

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pointer-events-auto max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-white p-6 text-ink shadow-[0_30px_80px_-20px_rgba(20,17,10,0.45)] sm:p-8"
          initial={{ opacity: 0, scale: 0.92, y: fromCard }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: fromCard / 2 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${toneClassName}`}>{groupLabel}</span>
              <h2 id={titleId} className="mt-3 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
                {item.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{money(item.price)}</p>
            </div>
            <button
              ref={closeButton}
              onClick={onClose}
              aria-label="Close details"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-ink/30 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {ITEM_DETAIL_SECTIONS.map((section) => (
              <section
                key={section.id}
                className={section.id === "questions" ? "sm:col-span-2" : undefined}
                aria-label={section.title(petName)}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{section.title(petName)}</h3>
                {details[section.id] ?? (
                  <div className="mt-2 rounded-xl border border-dashed border-line bg-cream/60 px-4 py-5">
                    <p className="text-sm text-muted">{section.hint}</p>
                    <p className="mt-1 text-xs text-muted/80 italic">Details coming soon</p>
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-full bg-ink px-6 py-2.5 font-semibold text-white transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body,
  );
}
