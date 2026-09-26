"use client";

// Shared screen, step 2 of 3: how the estimate is organized (components/CareExplainer), on
// the cream the welcome step's ripple ends on. Next is /plan/[id]/choose.

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { PlanHeader } from "@/components/AppChrome";
import { CareExplainer } from "@/components/CareExplainer";
import { OwnerStepper, PlanStatus, ownerStepHref } from "@/components/OwnerSteps";
import { usePlan } from "@/lib/use-plan";

export default function ExplainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { plan, error } = usePlan(id);
  const next = ownerStepHref(id, 3);

  useEffect(() => {
    router.prefetch(next);
  }, [router, next]);

  if (!plan) return <PlanStatus error={error} />;

  return (
    <MotionConfig reducedMotion="user">
      <div data-plan-screen className="flex-1 bg-cream text-ink">
        <PlanHeader plan={plan} note="Sample estimate" badge="Shared screen · vet + owner" />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
          <OwnerStepper id={id} step={2} />
          <div className="mt-8">
            <CareExplainer
              petName={plan.pet.name}
              items={plan.items}
              resourcesHref={`/plan/${id}/resources`}
              onShowPlan={() => router.push(next)}
            />
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
