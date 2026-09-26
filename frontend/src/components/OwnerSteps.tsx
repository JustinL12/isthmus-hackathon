"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/setup/SetupStepper";
import { DEMO_PLAN_ID } from "@/lib/sample-plan";
import { PageSpinner } from "@/components/Spinner";

// The shared screen the vet and owner look at together, one page per step:
//   /plan/[id] (welcome)  ->  /plan/[id]/explain  ->  /plan/[id]/choose
export const OWNER_STEPS = ["Welcome", "How it works", "Choose care"] as const;
const PATHS = ["", "/explain", "/choose"] as const;
const NEXT_LABELS = ["Next: How it works", "Next: Choose care"] as const;

export const ownerStepHref = (id: string, step: 1 | 2 | 3) => `/plan/${id}${PATHS[step - 1]}`;

/**
 * Owner progress (Welcome → How it works → Choose care), with back/next arrows. `onForward`
 * replaces the plain move to the next step (the welcome page plays its ripple first).
 */
export function OwnerStepper({ id, step, onForward }: { id: string; step: 1 | 2 | 3; onForward?: () => void }) {
  const router = useRouter();
  const go = (to: number) => () => router.push(ownerStepHref(id, to as 1 | 2 | 3));
  return (
    <Stepper
      steps={OWNER_STEPS}
      label="Plan steps"
      step={step}
      back={step > 1 ? { label: `Back: ${OWNER_STEPS[step - 2]}`, onClick: go(step - 1) } : undefined}
      forward={step < 3 ? { label: NEXT_LABELS[step - 1], onClick: onForward ?? go(step + 1) } : undefined}
    />
  );
}

/** Loading and "couldn't load" screens for the owner pages. */
export function PlanStatus({ error }: { error: string | null }) {
  return (
    <main className="flex flex-1 flex-col bg-cream p-8 text-ink">
      {error ? (
        <div className="mx-auto max-w-2xl space-y-3">
          <p className="text-bad">Couldn&apos;t load this plan. Is the backend running? ({error})</p>
          <Link href={`/plan/${DEMO_PLAN_ID}`} className="underline">
            Open the Mochi demo instead
          </Link>
        </div>
      ) : (
        <PageSpinner />
      )}
    </main>
  );
}
