"use client";

// Shared decision screen (the tablet the vet and owner look at together).
// TODO: live sync across devices (Supabase realtime), polish for tablet.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { Disclaimer } from "@/components/Disclaimer";
import { GroupBoard } from "@/components/GroupBoard";
import { PaymentToggle } from "@/components/PaymentToggle";
import { api } from "@/lib/api";
import { todayTotal } from "@/lib/plan-math";
import type { PaymentChoice, Plan } from "@/lib/types";

export default function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    api.getPlan(id).then(setPlan);
  }, [id]);

  if (!plan) return <main className="p-8">Loading…</main>;

  const total = todayTotal(plan.items);
  const overBudget = plan.budget != null && total > plan.budget;

  // Optimistic local update, then persist.
  async function save(patch: Partial<Plan>) {
    const next = { ...plan!, ...patch };
    setPlan(next);
    await api.updatePlan(id, patch);
  }

  const toggle = (itemId: string) =>
    save({ items: plan.items.map((i) => (i.id === itemId ? { ...i, selected: !i.selected } : i)) });

  async function agree() {
    const agreed = await api.agreePlan(id);
    router.push(`/summary/${agreed.share_token}`);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">
          {plan.pet.name}&apos;s plan · {plan.owner_name}
        </h1>
        <Disclaimer />
      </header>

      <BudgetBar total={total} budget={plan.budget} />
      <GroupBoard items={plan.items} onToggle={toggle} />

      <PaymentToggle
        value={plan.payment_choice}
        total={total}
        onChange={(payment_choice: PaymentChoice) => save({ payment_choice })}
      />

      <div className="flex gap-3">
        <button onClick={agree} className="rounded-lg bg-black px-5 py-3 text-white">
          Agree and send summary
        </button>
        <Link
          href={`/plan/${id}/resources`}
          className={`rounded-lg border px-5 py-3 ${overBudget ? "border-red-500 text-red-600" : ""}`}
        >
          Can&apos;t cover it today?
        </Link>
      </div>
    </main>
  );
}
