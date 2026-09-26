"use client";

// Shared decision screen (the tablet the vet and owner look at together).
// Two steps on one page: an intro with key numbers over a Madison backdrop, then
// "Get started" ripples the backdrop to cream and the decision tools float up.
// The title block stays mounted across both steps so it never moves.
// /plan/demo runs the Mochi/Alex sample locally with no backend.
// TODO: live sync across devices (Supabase realtime).

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { MagneticCard, MagneticCards } from "@/components/MagneticCards";
import { RippleTransition, type RippleControls } from "@/components/ui/ripple-transition";
import { TextMorph } from "@/components/ui/text-morph";
import { GROUP_TONE, GroupBoard } from "@/components/GroupBoard";
import { PaymentToggle } from "@/components/PaymentToggle";
import { TakeHomeSummary } from "@/components/TakeHomeSummary";
import { api } from "@/lib/api";
import { fullTotal, money, todayTotal } from "@/lib/plan-math";
import { DEMO_PLAN_ID, samplePlan } from "@/lib/sample-plan";
import { GROUPS, type Group, type PaymentChoice, type Plan } from "@/lib/types";

// Ripple goes from the first image to the second; module-level so the WebGL setup runs once.
const BACKDROPS = ["/backgrounds/madison.svg", "/backgrounds/cream.svg"] as const;
const RIPPLE_SECONDS = 1.3;
// The cream has covered the screen by ~60% of the ripple; content starts rising then.
const REVEAL_MS = 800;

type Step = "intro" | "leaving" | "decide";

// Headline cycles through what the screen helps with. Keep each under ~36 characters:
// TextMorph renders one line and the heading is sized to fit that.
function Headline({ petName }: { petName: string }) {
  // Stable array: a new one each render would restart the morph whenever an item is ticked.
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

export default function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const demo = id === DEMO_PLAN_ID;
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(demo ? samplePlan : null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const ripple = useRef<RippleControls | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!demo) api.getPlan(id).then(setPlan).catch((e) => setError(String(e)));
  }, [id, demo]);

  useEffect(() => {
    if (step !== "leaving") return;
    const timer = window.setTimeout(() => setStep("decide"), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  if (error)
    return (
      <main className="flex-1 bg-cream p-8 text-ink">
        <div className="mx-auto max-w-2xl space-y-3">
          <p className="text-bad">Couldn&apos;t load this plan. Is the backend running? ({error})</p>
          <Link href={`/plan/${DEMO_PLAN_ID}`} className="underline">
            Open the Mochi demo instead
          </Link>
        </div>
      </main>
    );
  if (!plan) return <main className="flex-1 bg-cream p-8 text-ink">Loading…</main>;

  const total = todayTotal(plan.items);
  const overBudget = plan.budget != null && total > plan.budget;
  const { pet } = plan;

  // Ripple out from the button; without WebGL or with reduced motion, just switch steps.
  function getStarted(event: MouseEvent<HTMLButtonElement>) {
    if (step !== "intro") return;
    const button = event.currentTarget.getBoundingClientRect();
    const box = backdrop.current?.getBoundingClientRect();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started =
      !reduceMotion &&
      box != null &&
      ripple.current?.play(
        (button.left + button.width / 2 - box.left) / box.width,
        (button.top + button.height / 2 - box.top) / box.height,
      );
    setStep(started ? "leaving" : "decide");
  }

  // Optimistic local update, then persist (demo mode stays local).
  async function save(patch: Partial<Plan>) {
    const next = { ...plan!, ...patch };
    setPlan(next);
    if (!demo) await api.updatePlan(id, patch);
  }

  const toggle = (itemId: string) =>
    save({ items: plan.items.map((i) => (i.id === itemId ? { ...i, selected: !i.selected } : i)) });

  const move = (itemId: string, group: Group) =>
    save({ items: plan.items.map((i) => (i.id === itemId ? { ...i, group } : i)) });

  const setGroupSelected = (group: Group, selected: boolean) =>
    save({ items: plan.items.map((i) => (i.group === group ? { ...i, selected } : i)) });

  async function agree() {
    const agreed = await api.agreePlan(id);
    router.push(`/summary/${agreed.share_token}`);
  }

  return (
    <div data-plan-screen className="relative isolate flex-1 text-ink">
      {/* Backdrop: Madison picture, rippled to cream on "Get started". The CSS background
          shows the same picture before WebGL loads or if it's unavailable; the cream layer
          on top covers it in the decide step (a plain fade when there's no ripple). */}
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
        <div
          className={`absolute inset-0 bg-cream transition-opacity duration-500 ${
            step === "decide" ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <header className="bg-badger text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-serif text-2xl">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="9.5" />
              <path d="m7.5 12.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Isthmus
          </Link>
          <div className="hidden h-9 w-px bg-white/30 sm:block" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {pet.name}
              {pet.age_years != null && ` · ${pet.age_years}-year-old ${pet.species}`}
            </p>
            <p className="truncate text-sm text-white/80">
              {[pet.reason, `Owner: ${plan.owner_name}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="hidden text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-white/80 lg:inline">
              Sample estimate
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium whitespace-nowrap text-white ring-1 ring-white/30">
              Shared screen · vet + owner
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="@container space-y-5">
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

          {step !== "decide" && (
            <section
              aria-label="Visit overview"
              className={`max-w-2xl pt-2 transition-all duration-300 ${
                step === "leaving" ? "pointer-events-none translate-y-2 opacity-0" : ""
              }`}
            >
              <MagneticCards className="grid gap-5 @lg:grid-cols-2">
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
                onClick={getStarted}
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
          )}

          {step === "decide" && (
            <div className="flex animate-float-up flex-wrap gap-2 text-xs motion-reduce:animate-none">
              {GROUPS.map((g) => {
                const groupItems = plan.items.filter((i) => i.group === g.id);
                const on = groupItems.length > 0 && groupItems.every((i) => i.selected);
                return (
                  <button
                    key={g.id}
                    onClick={() => setGroupSelected(g.id, !on)}
                    disabled={groupItems.length === 0}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 font-medium transition-colors disabled:opacity-40 ${
                      on ? `border-transparent ${GROUP_TONE[g.id]}` : "border-line bg-white text-muted hover:text-ink"
                    }`}
                  >
                    {on ? "✓ " : "+ "}
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}

          {step === "decide" && (
            <div className="animate-float-up motion-reduce:animate-none" style={{ animationDelay: "120ms" }}>
              <GroupBoard
                items={plan.items}
                petName={pet.name}
                draggable
                onMove={move}
                onToggle={toggle}
                detailsAlwaysVisible
              />
            </div>
          )}
        </div>

        {step === "decide" && (
          <aside
            className="animate-float-up space-y-5 self-start rounded-2xl border border-line bg-white p-5 motion-reduce:animate-none md:sticky md:top-6"
            style={{ animationDelay: "240ms" }}
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Today&apos;s plan</h2>
              <p className="font-serif text-5xl tabular-nums">{money(total)}</p>
              <p className="text-sm text-slate">Full estimate: {money(fullTotal(plan.items))}</p>
            </div>
  
            <BudgetBar
              total={total}
              budget={plan.budget}
              ownerName={plan.owner_name}
              onBudgetChange={(budget) => save({ budget })}
            />
  
            <PaymentToggle
              value={plan.payment_choice}
              total={total}
              onChange={(payment_choice: PaymentChoice) => save({ payment_choice })}
            />
  
            <Link
              href={`/plan/${id}/resources`}
              className={`block text-sm underline-offset-2 hover:underline ${
                overBudget ? "font-semibold text-bad" : "text-muted"
              }`}
            >
              Can&apos;t cover it today? See lower-cost Madison options →
            </Link>
  
            <hr className="border-line" />
  
            <TakeHomeSummary items={plan.items} />
  
            <div className="space-y-2">
              <button
                onClick={agree}
                disabled={demo}
                className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                <ChromaticLabel texture="pine">Agree &amp; send summary</ChromaticLabel>
              </button>
              {demo && (
                <p className="text-center text-xs text-muted">Demo mode: start from Setup to save and share.</p>
              )}
            </div>
          </aside>
        )}
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
    <div className="h-full rounded-2xl border border-white/70 bg-white/80 p-6 shadow-[0_24px_60px_-24px_rgba(80,50,30,0.35)] backdrop-blur-md sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-full bg-badger/10 text-badger [&>svg]:h-5 [&>svg]:w-5"
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-sm font-semibold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <p className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{value}</p>
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
