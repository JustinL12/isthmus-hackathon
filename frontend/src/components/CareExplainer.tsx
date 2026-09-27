"use client";

import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlipText } from "@/components/FlipText";
import { GROUP_TONE } from "@/components/GroupBoard";
import { smoothScrollTo } from "@/lib/smooth-scroll";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";

// Walks the owner through how the estimate is organized, one screen at a time:
//   0. customized plans  ->  1. choose by your preferences (red)  ->  2. what each group means
// "Next" flips the heading to the next message (components/FlipText); the group rows
// ease in under it on the last step. Once done, scrolling flips the panel up and away
// (the motion of components/ui/case-study-flip-stack.tsx).

type Stage = 0 | 1 | 2;
const LAST: Stage = 2;

const DEFINITIONS: Record<Group, (pet: string) => string> = {
  essential: (pet) => `Required today to properly treat ${pet}.`,
  soon: () => "Advised by your vet, but safe to delay a few days to weeks.",
  optional: () => "Not medically necessary — optional or preventive care.",
};

const DOT: Record<Group, string> = { essential: "bg-essential", soon: "bg-soon", optional: "bg-optional" };

// Readable reveal: rows start once the glide to the top (~0.8s) is done, so they
// don't compete with it for frames.
const ROWS_START_S = 0.9;
const ROW_GAP_S = 0.95;
const DEFINITION_LAG_S = 0.5;
const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];
const BOX_RISE = { y: 28, duration: 0.8 };
const ROW_RISE = { y: 44, duration: 0.9 }; // group rows drift in slower than boxes, to read along
// Where the top box lands when the groups step glides it into place.
const PANEL_TOP_GAP = 16;

export function CareExplainer({
  petName,
  items,
  onShowPlan,
}: {
  petName: string;
  items: PlanItem[];
  /** "See the full plan" (or "Skip to full plan"): reveal the plan and move to it. */
  onShowPlan: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>(0);
  // "Skip" jumps straight to the last step with no animations, so the layout is final
  // at once and the page lands on the plan exactly where the full walk-through does.
  const [skipped, setSkipped] = useState(false);
  const panel = useRef<HTMLElement>(null);

  // Flip away as the panel scrolls off the top, like a card leaving the flip stack.
  const { scrollYProgress } = useScroll({ target: panel, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 22, mass: 0.8, restDelta: 0.0005 });
  const rotateX = useTransform(progress, [0, 1], reduceMotion ? [0, 0] : [0, 22]);
  const y = useTransform(progress, [0, 1], reduceMotion ? ["0%", "0%"] : ["0%", "-18%"]);
  const scale = useTransform(progress, [0, 1], reduceMotion ? [1, 1] : [1, 0.94]);
  const opacity = useTransform(progress, [0, 0.8], [1, 0]);

  // The page moves exactly twice: here, and on "See the full plan" (in the page).
  // Entering the groups step, glide so this panel's top box sits at the top of the
  // screen; the heading flip covers the glide and the rows start once it's done.
  useEffect(() => {
    if (stage !== LAST || skipped) return;
    const frame = requestAnimationFrame(() => {
      const top = panel.current?.getBoundingClientRect().top;
      if (top != null) smoothScrollTo(window.scrollY + top - PANEL_TOP_GAP);
    });
    return () => cancelAnimationFrame(frame);
  }, [stage, skipped]);

  // Until the plan is shown, reserve a full screen below the panel's top. Without it the
  // page can be too short to glide the panel to the top, and the page length changes as
  // rows rise in (their offset counts toward scroll height), which makes the browser
  // jump the scroll position.
  const [reserveScreen, setReserveScreen] = useState(true);

  const groups = GROUPS.filter((g) => items.some((i) => i.group === g.id));

  const steps: { title: string; red?: boolean }[] = [
    { title: `We have multiple customized plans to keep ${petName} healthy` },
    { title: "Choose your plan based on your preferences", red: true },
    { title: `Here's what each group means for ${petName}` },
  ];
  const { title, red = false } = steps[stage];
  const still = reduceMotion || skipped;

  function next() {
    if (stage < LAST) setStage((stage + 1) as Stage);
  }

  function showPlan() {
    setReserveScreen(false);
    onShowPlan();
  }

  function skip() {
    setSkipped(true);
    setStage(LAST);
    showPlan();
  }

  // One box easing up into place after `delay` seconds (a quick fade with reduced motion,
  // and already in place after "Skip").
  const rise = (delay: number, { y, duration } = BOX_RISE) =>
    still
      ? { initial: skipped ? false : { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration, ease: EASE_OUT, delay },
        };

  return (
    <div
      className="[perspective:800px]"
      style={{ minHeight: reserveScreen ? `calc(100svh - ${PANEL_TOP_GAP}px)` : undefined }}
    >
      <motion.section
        ref={panel}
        aria-label={`How ${petName}'s estimate is organized`}
        style={{ rotateX, y, scale, opacity, transformOrigin: "50% 0%" }}
        className="space-y-4 will-change-transform"
      >
        <motion.div
          {...rise(0.15)}
          className={`rounded-2xl border p-6 shadow-[0_16px_50px_-24px_rgba(20,17,10,0.25)] transition-colors duration-700 sm:p-7 ${
            red ? "border-badger bg-badger text-white" : "border-line bg-white text-ink"
          }`}
        >
          <SmoothHeight instant={still}>
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
              <FlipText text={title} instant={skipped} />
            </h2>
          </SmoothHeight>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            {stage < LAST ? (
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
                  onClick={skip}
                  className={`text-sm underline-offset-4 transition-colors duration-700 hover:underline ${
                    red ? "text-white/80 hover:text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  Skip to full plan
                </button>
                <span
                  className={`ml-auto text-sm tabular-nums transition-colors duration-700 ${red ? "text-white/75" : "text-muted"}`}
                  aria-label={`Step ${stage + 1} of 3`}
                >
                  {stage + 1} / 3
                </span>
              </>
            ) : (
              <button
                onClick={showPlan}
                className="flex items-center gap-3 rounded-full bg-ink px-6 py-2.5 font-semibold text-white transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none"
              >
                See the full plan
                <motion.span
                  aria-hidden
                  animate={reduceMotion ? undefined : { y: [0, 4, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  ↓
                </motion.span>
              </button>
            )}
          </div>
        </motion.div>

        <AnimatePresence>
          {stage === LAST && (
            <motion.div key="groups" className="grid gap-4 md:grid-cols-2">
              {groups.flatMap((g, index) => {
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
      </motion.section>
    </div>
  );
}

// Eases its height to fit its content. When a step's heading takes fewer lines, the box
// shrinks smoothly (and the rows below move with it) instead of snapping.
function SmoothHeight({ instant, children }: { instant: boolean; children: ReactNode }) {
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
      transition={instant ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      <div ref={content}>{children}</div>
    </motion.div>
  );
}
