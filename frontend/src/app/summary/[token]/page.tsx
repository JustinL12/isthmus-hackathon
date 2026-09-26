"use client";

// Take-home summary, opened by share link (owner, roommate, or parent).
// TODO: approve / chip-in for co-owners (`shares` table), print styles, react-pdf (stretch).

import { use, useEffect, useState } from "react";
import { AppHeader, PageIntro, PlanHeader, StatusPage } from "@/components/AppChrome";
import { Disclaimer } from "@/components/Disclaimer";
import { api } from "@/lib/api";
import { SPLIT_PAYMENTS, fullTotal, money, todayTotal } from "@/lib/plan-math";
import type { Group, Plan, PlanItem } from "@/lib/types";
import { GROUP_TONE, card, secondaryButton, sectionLabel } from "@/lib/ui";

const BADGE = "Take-home plan";

// "2026-10-06" -> "Tue, Oct 6". Built from parts: new Date("2026-10-06") is UTC midnight,
// which is the previous evening (and day) in US time zones.
function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function SummaryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSharedPlan(token)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadError)
    return (
      <StatusPage header={<AppHeader badge={BADGE} />}>
        <h1 className="text-2xl font-extrabold tracking-tight">Plan not found</h1>
        <p className="text-muted">
          This link may be wrong, or the plan was cleared when the server restarted. Ask the clinic to share it again.
        </p>
      </StatusPage>
    );

  if (!plan)
    return (
      <div className="flex-1 text-ink">
        <AppHeader badge={BADGE} />
        <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">Loading…</main>
      </div>
    );

  const doneToday = plan.items.filter((i) => i.selected);
  const recheck = plan.items.filter((i) => !i.selected && i.group === "soon");
  const nextVisit = plan.items.filter((i) => !i.selected && i.group !== "soon");
  const total = todayTotal(plan.items);
  const installment = total / SPLIT_PAYMENTS;

  return (
    <div className="flex-1 text-ink">
      <PlanHeader plan={plan} note="Sample estimate" badge={BADGE} />
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="space-y-6">
          <PageIntro
            eyebrow="Take-home plan"
            title={
              <>
                <span className="text-badger">{plan.pet.name}&apos;s</span> care plan
              </>
            }
            subtitle="What was done today and what comes next. Share it with a roommate or parent who helps."
          />
          <Section title="Done today" tone="essential" items={doneToday} />
          <Section title="Scheduled for a recheck" tone="soon" items={recheck} />
          <Section title="Revisit at next visit" tone="optional" items={nextVisit} />
        </div>

        <aside className={`${card} space-y-5 self-start p-5 md:sticky md:top-6`}>
          <div>
            <h2 className={sectionLabel}>Today&apos;s total</h2>
            <p className="font-serif text-5xl tabular-nums">{money(total)}</p>
            <p className="text-sm text-slate">Full estimate: {money(fullTotal(plan.items))}</p>
          </div>
          <p className="text-sm text-good">
            {plan.payment_choice === "split"
              ? `${SPLIT_PAYMENTS} payments of ${money(installment)}, ${money(installment)} due today.`
              : `${money(total)} due at checkout.`}
          </p>
          <hr className="border-line" />
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className={`w-full ${secondaryButton}`}
          >
            Copy link to share with a roommate or parent
          </button>
          <Disclaimer />
        </aside>
      </main>
    </div>
  );
}

function Section({ title, tone, items }: { title: string; tone: Group; items: PlanItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      {/* Same header as the decision screen's group sections. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[tone]}`}>{title}</h2>
        <span className="ml-auto text-sm text-muted tabular-nums">{money(items.reduce((s, i) => s + i.price, 0))}</span>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-4 rounded-xl border border-line bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.name}</p>
              {i.recheck_date && <p className="text-sm text-slate">By {formatDate(i.recheck_date)}</p>}
            </div>
            <span className="shrink-0 text-lg font-semibold tabular-nums">{money(i.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
