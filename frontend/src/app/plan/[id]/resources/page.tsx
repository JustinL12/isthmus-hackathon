"use client";

// "Can't cover it today?" — lower-cost Madison options.
// TODO: map (Leaflet + OpenStreetMap), verify contact info the week of the event.

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AppHeader, PageIntro, PlanHeader } from "@/components/AppChrome";
import { api } from "@/lib/api";
import { DEMO_PLAN_ID, samplePlan } from "@/lib/sample-plan";
import type { Plan, Resource } from "@/lib/types";
import { card, secondaryButton } from "@/lib/ui";

const BADGE = "Shared screen · vet + owner";

export default function ResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const demo = id === DEMO_PLAN_ID;
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(demo ? samplePlan : null);

  useEffect(() => {
    let cancelled = false;
    api
      .resources()
      .then((r) => {
        if (!cancelled) setResources(r);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    // Only for the header's patient details; the page works without them.
    if (!demo)
      api
        .getPlan(id)
        .then((p) => {
          if (!cancelled) setPlan(p);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, demo]);

  return (
    <div className="flex-1 text-ink">
      {plan ? (
        <PlanHeader plan={plan} note="Sample estimate" badge={BADGE} />
      ) : (
        <AppHeader title="Can't cover it today?" subtitle="Lower-cost Madison options" badge={BADGE} />
      )}
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8">
        <PageIntro
          eyebrow="Lower-cost options"
          title={
            <>
              Can&apos;t cover it <span className="text-badger">today?</span>
            </>
          }
          subtitle={`These Madison options may be able to help. Ask your vet which fits ${plan ? plan.pet.name : "your pet"}.`}
        />

        {loadError ? (
          <p role="alert" className="text-bad">
            Couldn&apos;t load the options. Check that the Isthmus Care server is running, then reload.
          </p>
        ) : resources == null ? (
          <p className="text-muted">Loading options…</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => (
              <li key={r.id} className={`${card} flex flex-col p-5`}>
                <h2 className="text-lg font-semibold leading-snug">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-ink/20 decoration-2 underline-offset-4 hover:decoration-badger"
                    >
                      {r.name}
                      <span aria-hidden> ↗</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    r.name
                  )}
                </h2>
                <p className="mt-1 text-sm text-slate">{r.offers}</p>
                {r.eligibility && (
                  <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm text-ink/80">{r.eligibility}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <Link href={`/plan/${id}`} className={secondaryButton}>
          ← Back to {plan ? `${plan.pet.name}'s plan` : "the plan"}
        </Link>
      </main>
    </div>
  );
}
