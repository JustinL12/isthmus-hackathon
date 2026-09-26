"use client";

// Vet setup step 2: confirm suggested groups (drag between columns), add/remove items.
// TODO: catalog search to add items, remove button, per-item vet note.

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { GroupBoard } from "@/components/GroupBoard";
import { api } from "@/lib/api";
import type { Group, Plan } from "@/lib/types";

export default function ArrangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    api.getPlan(id).then(setPlan);
  }, [id]);

  async function move(itemId: string, group: Group) {
    if (!plan) return;
    const items = plan.items.map((i) => (i.id === itemId ? { ...i, group } : i));
    setPlan({ ...plan, items });
    setPlan(await api.updatePlan(id, { items }));
  }

  if (!plan) return <main className="p-8">Loading…</main>;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">
        {plan.pet.name}: {plan.pet.reason}
      </h1>
      <p className="text-gray-600">Drag items to confirm which group each belongs in.</p>
      <GroupBoard items={plan.items} draggable onMove={move} />
      <Link href={`/plan/${id}`} className="inline-block rounded-lg bg-black px-5 py-3 text-white">
        Review with {plan.owner_name}
      </Link>
    </main>
  );
}
