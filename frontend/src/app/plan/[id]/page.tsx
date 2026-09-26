"use client";

// Shared screen (the tablet the vet and owner look at together), step 1 of 3: a welcome with
// the key facts over a Madison backdrop. "Get started" ripples the backdrop to cream, then
// opens /plan/[id]/explain (step 2), which starts on the same cream. Step 3 is /plan/[id]/choose.
// /plan/demo runs the Mochi/Alex sample locally with no backend.
// TODO: live sync across devices (Supabase realtime).

import { useRouter } from "next/navigation";
import { type ReactNode, use, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PlanHeader } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { MagneticCard, MagneticCards } from "@/components/MagneticCards";
import { OwnerStepper, PlanStatus, ownerStepHref } from "@/components/OwnerSteps";
import { RippleTransition, type RippleControls } from "@/components/ui/ripple-transition";
import { TextMorph } from "@/components/ui/text-morph";
import { usePlan } from "@/lib/use-plan";

// Ripple goes from the first image to the second; module-level so the WebGL setup runs once.
const BACKDROPS = ["/backgrounds/madison.svg", "/backgrounds/cream.svg"] as const;
const RIPPLE_SECONDS = 1.3;
// The cream has covered the screen by ~60% of the ripple; the next step opens then.
const REVEAL_MS = 800;

// Headline cycles through what the screen helps with. Keep each under ~36 characters:
// TextMorph renders one line and the heading is sized to fit that.
function Headline({ petName }: { petName: string }) {
  // Stable array: a new one each render would restart the morph.
  const words = useMemo(
    () => [
      `Let's decide on ${petName}'s care together`,
      "Find what matters most today",
      "Understand every item on the bill",
      "Choose care that fits your budget",
      "Go home with a clear plan",
    ],
    [petName],
  );
  return <TextMorph words={words} interval={3000} align="start" />;
}

export default function WelcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { plan, error } = usePlan(id);
  const [leaving, setLeaving] = useState(false);
  const ripple = useRef<RippleControls | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const next = ownerStepHref(id, 2);

  useEffect(() => {
    router.prefetch(next);
  }, [router, next]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => router.push(next), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, router, next]);

  if (!plan) return <PlanStatus error={error} />;
  const { pet } = plan;

  // Ripple out from `from` (the button), then move on; without WebGL or with reduced motion, go straight there.
  function getStarted(from?: HTMLElement) {
    if (leaving) return;
    const box = backdrop.current?.getBoundingClientRect();
    const origin = from?.getBoundingClientRect();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started =
      !reduceMotion &&
      box != null &&
      ripple.current?.play(
        origin ? (origin.left + origin.width / 2 - box.left) / box.width : 0.5,
        origin ? (origin.top + origin.height / 2 - box.top) / box.height : 0.5,
      );
    if (started) setLeaving(true);
    else router.push(next);
  }

  return (
    <div data-plan-screen className="relative isolate flex-1 text-ink">
      {/* Backdrop: Madison picture, rippled to cream on "Get started". The CSS background
          shows the same picture before WebGL loads or if it's unavailable. */}
      <div ref={backdrop} className="fixed inset-0 -z-10" aria-hidden>
        <RippleTransition
          controlRef={ripple}
          interactive={false}
          images={BACKDROPS}
          duration={RIPPLE_SECONDS}
          borderRadius={0}
          glow={0.45}
          pushAmt={0.12}
          background="url(/backgrounds/madison.svg) center / cover no-repeat #f6f2ea"
          className="min-h-0"
        />
      </div>

      <PlanHeader plan={plan} note="Sample estimate" badge="Shared screen · vet + owner" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <OwnerStepper id={id} step={1} onForward={() => getStarted()} />

        <div className="@container mt-6 max-w-4xl space-y-5">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-badger">
              <span className="h-px w-6 bg-badger" aria-hidden />
              Today&apos;s visit
            </p>
            <h1 className="text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] @xl:text-5xl @3xl:text-6xl">
              <span className="text-badger">{pet.name}&apos;s</span> care plan
            </h1>
            {/* Rotating phrases are decorative; the heading carries the meaning.
                They can't wrap, so size from the column width, not the viewport. */}
            <p
              aria-hidden
              className="border-l-2 border-badger/40 pl-3 font-serif text-lg leading-snug text-slate italic @xl:text-xl @3xl:text-2xl"
            >
              <Headline petName={pet.name} />
            </p>
          </div>

          <section
            aria-label="Visit overview"
            className={`max-w-xl pt-2 transition-all duration-300 ${
              leaving ? "pointer-events-none translate-y-2 opacity-0" : ""
            }`}
          >
            <MagneticCards className="grid gap-4 @lg:grid-cols-2">
              <MagneticCard>
                <IntroCard
                  icon={<PawIcon />}
                  label="Patient"
                  value={pet.name}
                  note={pet.age_years != null ? `${pet.age_years}-year-old ${pet.species}` : pet.species}
                />
              </MagneticCard>
              <MagneticCard>
                <IntroCard
                  icon={<CalendarIcon />}
                  label="Visit"
                  value={<VisitClock part="date" />}
                  note={<VisitClock part="time" />}
                />
              </MagneticCard>
            </MagneticCards>

            <button
              onClick={(e) => getStarted(e.currentTarget)}
              className="group mt-7 inline-block rounded-xl transition-transform duration-300 ease-out hover:scale-[1.06] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <ChromaticLabel className="px-8 py-3.5 text-lg shadow-lg shadow-badger/30 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-badger/40">
                Get started{" "}
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                >
                  →
                </span>
              </ChromaticLabel>
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

function IntroCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="h-full rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_24px_60px_-24px_rgba(80,50,30,0.35)] backdrop-blur-md sm:p-6">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-full bg-badger/10 text-badger [&>svg]:h-5 [&>svg]:w-5"
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-sm font-semibold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <p className="mt-3 font-serif text-3xl leading-tight">{value}</p>
      {note && <p className="mt-1.5 text-base text-muted">{note}</p>}
    </div>
  );
}

// Current visit date/time. The server has no clock of the viewer's, so it renders a
// placeholder and the browser fills it in (useSyncExternalStore avoids a hydration mismatch).
const subscribeMinute = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);

function VisitClock({ part }: { part: "date" | "time" }) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, () => null);
  if (minute == null) return <span className="text-muted">—</span>;
  const now = new Date(minute * 60_000);
  return part === "date"
    ? now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-4 w-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function PawIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5.5" cy="10" r="1.8" />
      <circle cx="9.5" cy="5.5" r="1.8" />
      <circle cx="14.5" cy="5.5" r="1.8" />
      <circle cx="18.5" cy="10" r="1.8" />
      <path d="M12 12c-2.8 0-5 2.6-5 5 0 1.6 1.2 2.6 2.6 2.6.9 0 1.6-.4 2.4-.4s1.5.4 2.4.4c1.4 0 2.6-1 2.6-2.6 0-2.4-2.2-5-5-5Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
