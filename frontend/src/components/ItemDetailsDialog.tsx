"use client";

import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { money } from "@/lib/plan-math";
import type { Explanation, PlanItem } from "@/lib/types";

// Expanded view of one estimate item: what happens, why it matters, what waiting means, what
// the price covers, and questions to ask. Content comes from the clinic's explanation library
// (edited on /clinic). A plan keeps the explanation it was built with; details it doesn't have
// (plans built before they existed) are filled from the library.

export type ItemDetailSection = "procedure" | "why" | "postpone" | "cost" | "questions";

export const ITEM_DETAIL_SECTIONS: { id: ItemDetailSection; title: (pet: string) => string }[] = [
  { id: "procedure", title: () => "What happens" },
  { id: "why", title: (pet) => `Why it matters for ${pet}` },
  { id: "postpone", title: () => "If you wait" },
  { id: "cost", title: () => "What the price covers" },
  { id: "questions", title: () => "Questions to ask your vet" },
];

// The clinic's library, fetched once per page load (only needed for older plans).
let library: Promise<Record<string, Explanation>> | null = null;
const loadLibrary = () => (library ??= api.explanations().catch((): Record<string, Explanation> => ({})));

function useExplanation(item: PlanItem): Explanation | null {
  const own = item.explanation ?? null;
  const complete = own != null && own.steps != null && own.cost_includes != null && (own.questions?.length ?? 0) > 0;
  const [fromLibrary, setFromLibrary] = useState<Explanation | null>(null);
  useEffect(() => {
    if (complete) return;
    let cancelled = false;
    void loadLibrary().then((all) => {
      if (!cancelled) setFromLibrary(all[item.catalog_id] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [complete, item.catalog_id]);
  if (!own) return fromLibrary;
  return {
    ...own,
    steps: own.steps ?? fromLibrary?.steps,
    cost_includes: own.cost_includes ?? fromLibrary?.cost_includes,
    questions: own.questions?.length ? own.questions : (fromLibrary?.questions ?? []),
  };
}

function Paragraphs({ lines }: { lines: (string | null | undefined)[] }) {
  return (
    <div className="mt-2 space-y-2 text-ink/85">
      {lines.filter(Boolean).map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export function ItemDetailsDialog({
  item,
  petName,
  groupLabel,
  toneClassName,
  originY,
  onClose,
}: {
  item: PlanItem;
  petName: string;
  groupLabel: string;
  /** Group chip colors, e.g. GROUP_TONE[item.group]. */
  toneClassName: string;
  /** Vertical center of the card that opened this, so the panel grows out from it. */
  originY: number;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const explanation = useExplanation(item);
  const ask = "Ask your vet about this.";
  const content: Record<ItemDetailSection, ReactNode> = {
    procedure: <Paragraphs lines={explanation ? [explanation.what, explanation.steps] : [ask]} />,
    why: <Paragraphs lines={[explanation?.why ?? ask]} />,
    postpone: <Paragraphs lines={[explanation?.if_postponed ?? "Ask your vet whether this can safely wait."]} />,
    cost: (
      <div className="mt-2 text-ink/85">
        <p className="font-serif text-2xl text-ink tabular-nums">{money(item.price)}</p>
        <p className="mt-1">{explanation?.cost_includes ?? "Ask your vet what this price includes."}</p>
      </div>
    ),
    questions: explanation?.questions?.length ? (
      <ul className="mt-2 space-y-1.5 text-ink/85">
        {explanation.questions.map((q) => (
          <li key={q} className="flex gap-2">
            <span aria-hidden className="text-badger">
              ?
            </span>
            {q}
          </li>
        ))}
      </ul>
    ) : (
      <Paragraphs lines={["Is this needed today, or can it wait?", "Is there a lower-cost option?"]} />
    ),
  };
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
                {content[section.id]}
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
