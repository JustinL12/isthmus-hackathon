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
import Link from "next/link";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlipText } from "@/components/FlipText";
import { GROUP_TONE } from "@/components/GroupBoard";
import { smoothScrollTo } from "@/lib/smooth-scroll";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";

// Walks the owner through how the estimate is organized, one screen at a time:
//   0. overview  ->  1. the three groups and what they mean  ->  2. lower-cost options
// "Next" flips the heading to the next message (components/FlipText); the group rows
// pop in under it on step 1 and fade away for step 2. Once done, scrolling flips the
// panel up and away (the motion of components/ui/case-study-flip-stack.tsx).

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
// Where the top box lands when the groups step glides it into place.
const PANEL_TOP_GAP = 16;

export function CareExplainer({
  petName,
  items,
  resourcesHref,
  onShowPlan,
}: {
  petName: string;
  items: PlanItem[];
  resourcesHref: string;
  /** "See the full plan" (or "Skip to full plan"): reveal the plan and move to it. */
  onShowPlan: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>(0);
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
    if (stage !== 1) return;
    const frame = requestAnimationFrame(() => {
      const top = panel.current?.getBoundingClientRect().top;
      if (top != null) smoothScrollTo(window.scrollY + top - PANEL_TOP_GAP);
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  // Until the plan is shown, reserve a full screen below the panel's top. Without it the
  // page can be too short to glide the panel to the top, and the page length changes as
  // rows rise in (their offset counts toward scroll height) or leave, which makes the
  // browser jump the scroll position.
  const [reserveScreen, setReserveScreen] = useState(true);

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

  function showPlan() {
    setReserveScreen(false);
    onShowPlan();
  }

  function skip() {
    setStage(2);
    showPlan();
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
                <button onClick={skip} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                  Skip to full plan
                </button>
                <span className="ml-auto text-sm text-muted tabular-nums" aria-label={`Step ${stage + 1} of 3`}>
                  {stage + 1} / 3
                </span>
              </>
            ) : (
              <>
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
      </motion.section>
    </div>
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
