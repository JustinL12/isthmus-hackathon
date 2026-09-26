"use client";

import { AnimatePresence, motion, type Transition, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { FlipText } from "@/components/FlipText";
import { GROUP_TONE } from "@/components/GroupBoard";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";

// Walks the owner through how the estimate is organized, one screen at a time:
//   0. overview  ->  1. the three groups and what they mean  ->  2. lower-cost options
// "Next" flips the heading to the next message (components/FlipText); the group rows
// pop in under it on step 1 and fade away for step 2. "See the full plan" moves on to
// /plan/[id]/choose.

type Stage = 0 | 1 | 2;

const DEFINITIONS: Record<Group, (pet: string) => string> = {
  essential: (pet) => `Care tied to why ${pet} is here today. Your vet recommends starting these now.`,
  soon: () => "Important, but often fine within days or weeks, so these can move to a recheck visit.",
  optional: () => "Preventive or optional care with flexible timing. Easy to revisit at a future visit.",
};

const DOT: Record<Group, string> = { essential: "bg-essential", soon: "bg-soon", optional: "bg-optional" };

// Slow, readable reveal: rows start once the heading flip is mostly done.
const ROWS_START_S = 1.2;
const ROW_GAP_S = 1.5;
const DEFINITION_LAG_S = 0.8;
const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];
const BOX_RISE = { y: 28, duration: 0.8 };
const ROW_RISE = { y: 44, duration: 1.4 }; // group rows drift in slower, to read along

export function CareExplainer({
  petName,
  items,
  resourcesHref,
  onShowPlan,
}: {
  petName: string;
  items: PlanItem[];
  resourcesHref: string;
  /** "See the full plan" (or "Skip to full plan"). */
  onShowPlan: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>(0);
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter(
    (g) => g.items.length > 0,
  );

  const copy = [
    {
      eyebrow: `Sorted with ${petName} in mind`,
      title: `${petName}'s vet sorted today's estimate by what matters most`,
      body: `Each item is grouped by how soon ${petName} needs it, so you can put your budget where it counts today. Your vet makes the final call.`,
    },
    {
      eyebrow: "Three groups",
      title: `Here's what each group means for ${petName}`,
      body: "Every item on the estimate falls into one of these. Your vet makes the final call on each.",
    },
    {
      eyebrow: "Tight on budget?",
      title: "Lower-cost care options are available",
      body: "Lower-cost clinics in Madison can cost 2–3× less for some care. Eligibility applies.",
    },
  ][stage];

  function next() {
    if (stage < 2) setStage((stage + 1) as Stage);
  }

  // One box easing up into place after `delay` seconds (a quick fade with reduced motion).
  const rise = (delay: number, { y, duration } = BOX_RISE) =>
    reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration, ease: EASE_OUT, delay },
        };

  return (
    <section aria-label={`How ${petName}'s estimate is organized`} className="space-y-4">
        <motion.div
          {...rise(0.15)}
          className={`rounded-2xl border p-6 shadow-[0_16px_50px_-24px_rgba(20,17,10,0.25)] transition-colors duration-700 sm:p-7 ${
            stage === 2 ? "border-badger/25 bg-[#fbeeec]" : "border-line bg-white"
          }`}
        >
          <SmoothHeight reduceMotion={reduceMotion}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-badger">
              <FlipText text={copy.eyebrow} duration={380} />
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
              <FlipText text={copy.title} />
            </h2>
            {/* Old and new text overlap while crossfading, so the box never collapses in between. */}
            <div className="mt-2 grid max-w-3xl">
              <AnimatePresence initial={false}>
                <motion.p
                  key={stage}
                  className="col-start-1 row-start-1 text-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.5, delay: 0.4 } }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                >
                  {copy.body}
                </motion.p>
              </AnimatePresence>
            </div>
          </SmoothHeight>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            {stage < 2 ? (
              <>
                <button
                  onClick={next}
                  className="group rounded-full bg-ink px-6 py-2.5 font-semibold text-white transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none"
                >
                  Next{" "}
                  <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
                <button onClick={onShowPlan} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                  Skip to full plan
                </button>
                <span className="ml-auto text-sm text-muted tabular-nums" aria-label={`Step ${stage + 1} of 3`}>
                  {stage + 1} / 3
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={onShowPlan}
                  className="flex items-center gap-3 rounded-full bg-ink px-6 py-2.5 font-semibold text-white transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none"
                >
                  See the full plan
                  <motion.span
                    aria-hidden
                    animate={reduceMotion ? undefined : { x: [0, 4, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </button>
                <Link
                  href={resourcesHref}
                  className="group/link font-semibold whitespace-nowrap text-badger underline-offset-4 hover:underline"
                >
                  See Madison options{" "}
                  <span aria-hidden className="inline-block transition-transform group-hover/link:translate-x-0.5">
                    →
                  </span>
                </Link>
              </>
            )}
          </div>
        </motion.div>

        <AnimatePresence>
          {stage === 1 && (
            <motion.div
              key="groups"
              className="grid gap-4 md:grid-cols-2"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.45 } }}
            >
              {groups.flatMap((g, index) => {
                const delay = ROWS_START_S + index * ROW_GAP_S;
                return [
                  <motion.div
                    key={`${g.id}-group`}
                    {...rise(delay, ROW_RISE)}
                    className={`rounded-2xl p-5 ${GROUP_TONE[g.id]}`}
                  >
                    <h3 className="text-lg font-bold">{g.label}</h3>
                    <p className="mt-1 text-sm opacity-80">{g.items.map((i) => i.name).join(" · ")}</p>
                  </motion.div>,
                  <motion.div
                    key={`${g.id}-definition`}
                    {...rise(delay + DEFINITION_LAG_S, ROW_RISE)}
                    className="flex items-center rounded-2xl border border-line bg-white p-5"
                  >
                    <p className="text-ink/85">
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${DOT[g.id]}`} aria-hidden />
                      {DEFINITIONS[g.id](petName)}
                    </p>
                  </motion.div>,
                ];
              })}
            </motion.div>
          )}
        </AnimatePresence>
    </section>
  );
}

// Eases its height to fit its content. When a step's heading or text takes fewer lines,
// the box shrinks smoothly (and the rows below move with it) instead of snapping.
function SmoothHeight({ reduceMotion, children }: { reduceMotion: boolean; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      <div ref={content}>{children}</div>
    </motion.div>
  );
}
