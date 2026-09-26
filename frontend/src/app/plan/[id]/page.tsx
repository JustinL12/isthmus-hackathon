"use client";

// Shared decision screen (the tablet the vet and owner look at together).
// /plan/demo runs the Mochi/Alex sample locally with no backend.
// TODO: live sync across devices (Supabase realtime).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { TextMorph } from "@/components/ui/text-morph";
import { GROUP_TONE, GroupBoard } from "@/components/GroupBoard";
import { PaymentToggle } from "@/components/PaymentToggle";
import { TakeHomeSummary } from "@/components/TakeHomeSummary";
import { api } from "@/lib/api";
import { fullTotal, money, todayTotal } from "@/lib/plan-math";
import { DEMO_PLAN_ID, samplePlan } from "@/lib/sample-plan";
import { GROUPS, type Group, type PaymentChoice, type Plan } from "@/lib/types";

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

  useEffect(() => {
    if (!demo) api.getPlan(id).then(setPlan).catch((e) => setError(String(e)));
  }, [id, demo]);

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
    <div className="flex-1 bg-cream text-ink">
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
            <div className="flex flex-wrap gap-2 pt-3 text-xs">
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
          </div>

          <GroupBoard
            items={plan.items}
            petName={pet.name}
            draggable
            onMove={move}
            onToggle={toggle}
            detailsAlwaysVisible
          />
        </div>

        <aside className="space-y-5 self-start rounded-2xl border border-line bg-white p-5 md:sticky md:top-6">
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
      </main>
    </div>
  );
}
