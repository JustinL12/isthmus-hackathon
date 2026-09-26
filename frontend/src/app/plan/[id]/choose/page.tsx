"use client";

// Shared screen, step 3 of 3: pick today's care. The owner ticks items and whole groups, the
// vet can drag items between groups, and the sidebar keeps the total against the budget.
// "Agree & send summary" saves the plan and opens the take-home summary.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { MotionConfig, motion } from "framer-motion";
import { PageIntro, PlanHeader } from "@/components/AppChrome";
import { BudgetBar } from "@/components/BudgetBar";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { GROUP_TONE, GroupBoard } from "@/components/GroupBoard";
import { OwnerStepper, PlanStatus } from "@/components/OwnerSteps";
import { PaymentToggle } from "@/components/PaymentToggle";
import { TakeHomeSummary } from "@/components/TakeHomeSummary";
import { api } from "@/lib/api";
import { fullTotal, money, todayTotal } from "@/lib/plan-math";
import { GROUPS, type Group, type PaymentChoice } from "@/lib/types";
import { usePlan } from "@/lib/use-plan";

// Board and sidebar float up on arrival (MotionConfig drops the motion for reduced-motion users).
const RISE = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 140, damping: 22 },
} as const;

export default function ChoosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { plan, error, demo, save } = usePlan(id);

  if (!plan) return <PlanStatus error={error} />;

  const total = todayTotal(plan.items);
  const overBudget = plan.budget != null && total > plan.budget;
  const { pet } = plan;

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
    <MotionConfig reducedMotion="user">
      <div data-plan-screen className="flex-1 bg-cream text-ink">
        <PlanHeader plan={plan} note="Sample estimate" badge="Shared screen · vet + owner" />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
          <OwnerStepper id={id} step={3} />
          <div className="mt-6">
            <PageIntro
              eyebrow="Today's visit"
              title={
                <>
                  Choose <span className="text-badger">{pet.name}&apos;s</span> care for today
                </>
              }
              subtitle="Tick what you'd like to do today. Anything left unticked stays on the plan for later."
            />
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
            <motion.div className="space-y-5" {...RISE}>
              <div className="flex flex-wrap gap-2 text-xs">
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

              <GroupBoard
                items={plan.items}
                petName={pet.name}
                draggable
                onMove={move}
                onToggle={toggle}
                detailsAlwaysVisible
                expandable
              />
            </motion.div>

            <motion.aside
              className="space-y-5 self-start rounded-2xl border border-line bg-white p-5 md:sticky md:top-6"
              {...RISE}
              transition={{ ...RISE.transition, delay: 0.12 }}
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
            </motion.aside>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
