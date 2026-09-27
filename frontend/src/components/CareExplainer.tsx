"use client";

import { AnimatePresence, motion, type Transition, useReducedMotion } from "framer-motion";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { FlipText } from "@/components/FlipText";
import { GROUP_TONE } from "@/components/GroupBoard";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";

// Walks the owner through how the estimate is organized, one screen at a time:
//   0. customized plans  ->  1. choose by your preferences (red)  ->  2. what each group means
// "Next" flips the heading to the next message (components/FlipText); the group rows ease in
// under it on the last step. "See the full plan" moves on to /plan/[id]/choose, which also
// links to the lower-cost Madison options.

type Stage = 0 | 1 | 2;
const LAST_STAGE: Stage = 2;

const DEFINITIONS: Record<Group, (pet: string) => string> = {
  essential: (pet) => `Required today to properly treat ${pet}.`,
  soon: () => "Advised by your vet, but safe to delay a few days to weeks.",
  optional: () => "Not medically necessary — optional or preventive care.",
};

const DOT: Record<Group, string> = { essential: "bg-essential", soon: "bg-soon", optional: "bg-optional" };

// Readable reveal: rows start once the heading flip is mostly done.
const ROWS_START_S = 0.9;
const ROW_GAP_S = 0.95;
const DEFINITION_LAG_S = 0.5;
const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];
const BOX_RISE = { y: 28, duration: 0.8 };
const ROW_RISE = { y: 44, duration: 0.9 }; // group rows drift in slower than boxes, to read along

export function CareExplainer({
  petName,
  onShowPlan,
}: {
  petName: string;
  items: PlanItem[];
  /** "See the full plan" (or "Skip to full plan"). */
  onShowPlan: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>(0);

  const steps: { title: string; red?: boolean }[] = [
    { title: `We have multiple customized plans to keep ${petName} healthy` },
    { title: "Choose your plan based on your preferences", red: true },
    { title: `Here's what each group means for ${petName}` },
  ];
  const { title, red = false } = steps[stage];

  function next() {
    if (stage < LAST_STAGE) setStage((stage + 1) as Stage);
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
          red ? "border-badger bg-badger text-white" : "border-line bg-white text-ink"
        }`}
      >
        <SmoothHeight reduceMotion={reduceMotion}>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
            <FlipText text={title} />
          </h2>
        </SmoothHeight>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {stage < LAST_STAGE ? (
            <>
              <button
                onClick={next}
                className={`group rounded-full px-6 py-2.5 font-semibold transition duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none ${
                  red ? "bg-white text-badger" : "bg-ink text-white"
                }`}
              >
                Next{" "}
                <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </button>
              <button
                onClick={onShowPlan}
                className={`text-sm underline-offset-4 transition-colors duration-700 hover:underline ${
                  red ? "text-white/80 hover:text-white" : "text-muted hover:text-ink"
                }`}
              >
                Skip to full plan
              </button>
              <span
                className={`ml-auto text-sm tabular-nums transition-colors duration-700 ${red ? "text-white/75" : "text-muted"}`}
                aria-label={`Step ${stage + 1} of ${LAST_STAGE + 1}`}
              >
                {stage + 1} / {LAST_STAGE + 1}
              </span>
            </>
          ) : (
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
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {stage === LAST_STAGE && (
          <motion.div key="groups" className="grid gap-4 md:grid-cols-2">
            {/* All three groups, always: the owner learns what each means even if one is empty today. */}
            {GROUPS.flatMap((g, index) => {
              const delay = ROWS_START_S + index * ROW_GAP_S;
              return [
                <motion.div
                  key={`${g.id}-group`}
                  {...rise(delay, ROW_RISE)}
                  className={`flex items-center rounded-2xl p-5 ${GROUP_TONE[g.id]}`}
                >
                  <h3 className="text-lg font-bold">{g.label}</h3>
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

// Eases its height to fit its content. When a step's heading takes fewer lines, the box
// shrinks smoothly (and the rows below move with it) instead of snapping.
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
