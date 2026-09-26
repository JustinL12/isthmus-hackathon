"use client";

// Take-home summary, opened by share link (owner, roommate, or parent).
// TODO: approve / chip-in for co-owners (`shares` table), print styles, react-pdf (stretch).

import { use, useEffect, useState } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { api } from "@/lib/api";
import { money, todayTotal } from "@/lib/plan-math";
import type { Plan, PlanItem } from "@/lib/types";

export default function SummaryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    api.getSharedPlan(token).then(setPlan);
  }, [token]);

  if (!plan) return <main className="p-8">Loading…</main>;

  const doneToday = plan.items.filter((i) => i.selected);
  const recheck = plan.items.filter((i) => !i.selected && i.group === "soon");
  const nextVisit = plan.items.filter((i) => !i.selected && i.group !== "soon");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-bold">{plan.pet.name}&apos;s care plan</h1>
      <Section title={`Done today (${money(todayTotal(plan.items))})`} items={doneToday} />
      <Section title="Scheduled for a recheck" items={recheck} />
      <Section title="Revisit at next visit" items={nextVisit} />
      <button
        onClick={() => navigator.clipboard.writeText(window.location.href)}
        className="rounded-lg border px-4 py-2"
      >
        Copy link to share with a roommate or parent
      </button>
      <Disclaimer />
    </main>
  );
}

function Section({ title, items }: { title: string; items: PlanItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between">
            <span>
              {i.name}
              {i.recheck_date && <span className="text-gray-600"> · by {i.recheck_date}</span>}
            </span>
            <span>{money(i.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
