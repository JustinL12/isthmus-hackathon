"use client";

// The vet team's previous visits, newest first: continue a plan that's still in progress
// (vet setup's sort-items step), or open the take-home summary of an agreed visit.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { Spinner } from "@/components/Spinner";
import { api } from "@/lib/api";
import { describePet } from "@/lib/pet";
import { money } from "@/lib/plan-math";
import type { PlanSummary } from "@/lib/types";
import { card, input, secondaryButton } from "@/lib/ui";

const STATUS = {
  draft: { label: "In progress", tone: "bg-soon-soft text-soon", total: "Selected so far" },
  agreed: { label: "Agreed", tone: "bg-optional-soft text-optional", total: "Done today" },
} as const;

// "Sep 26, 2026 · 3:18 PM" in the viewer's time zone (created_at is an ISO date-time).
function formatWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

const matches = (v: PlanSummary, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [v.pet.name, v.owner_name, v.pet.reason ?? ""].some((s) => s.toLowerCase().includes(q));
};

export default function VisitsPage() {
  const [visits, setVisits] = useState<PlanSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .listPlans()
      .then((v) => {
        if (!cancelled) setVisits(v);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const shown = visits?.filter((v) => matches(v, query)) ?? [];

  return (
    <div className="flex-1 text-ink">
      <AppHeader title="Previous visits" subtitle="Newest first" badge="Vet team" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            eyebrow="For the vet team"
            title={
              <>
                Previous <span className="text-badger">visits</span>
              </>
            }
            subtitle="Continue a plan that's still in progress, or open the take-home summary of an agreed visit."
          />
          <Link href="/setup?new=1" className={secondaryButton}>
            + Start a new visit
          </Link>
        </div>

        {loadError ? (
          <div className={`${card} max-w-xl space-y-3 p-6`}>
            <h2 className="text-xl font-extrabold tracking-tight">Couldn&apos;t load visits</h2>
            <p className="text-muted">Check that the Isthmus Care server is running, then try again.</p>
            <button
              onClick={() => {
                setLoadError(false);
                setVisits(null);
                setLoadAttempt((n) => n + 1);
              }}
              className={secondaryButton}
            >
              Try again
            </button>
          </div>
        ) : visits == null ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading visits" />
          </div>
        ) : visits.length === 0 ? (
          <div className={`${card} max-w-xl space-y-3 p-6`}>
            <h2 className="text-xl font-extrabold tracking-tight">No visits yet</h2>
            <p className="text-muted">Visits you start show up here, newest first.</p>
            <Link href="/setup?new=1" className={secondaryButton}>
              Start a new visit
            </Link>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search visits"
              placeholder="Search by pet, owner, or reason"
              className={`max-w-md ${input}`}
            />
            <p className="text-sm text-muted" aria-live="polite">
              {query.trim()
                ? `${shown.length} of ${visits.length} ${visits.length === 1 ? "visit" : "visits"}`
                : `${visits.length} ${visits.length === 1 ? "visit" : "visits"}`}
            </p>
            {shown.length === 0 ? (
              <p className="text-muted">No visits match &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              <ul className="grid gap-3">
                {shown.map((v) => (
                  <VisitRow key={v.id} visit={v} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function VisitRow({ visit: v }: { visit: PlanSummary }) {
  const status = STATUS[v.status];
  const when = formatWhen(v.created_at);
  // Same pet description as the plan header (age, breed, weight when known).
  const details = [describePet(v.pet), v.pet.reason].filter(Boolean).join(" · ");
  const action =
    v.status === "agreed"
      ? v.share_token && { href: `/summary/${v.share_token}`, label: "View summary" }
      : { href: `/plan/${v.id}/arrange`, label: "Continue" };

  return (
    <li className={`${card} flex flex-wrap items-center gap-x-6 gap-y-3 p-5`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{v.pet.name}</h2>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        </div>
        {details && <p className="text-sm text-slate">{details}</p>}
        <p className="text-sm text-muted">
          Owner: {v.owner_name}
          {when && <> · {when}</>}
        </p>
      </div>
      <div className="text-right">
        <p className="font-serif text-3xl leading-none tabular-nums">{money(v.total_today)}</p>
        <p className="mt-1 text-xs text-muted">
          {status.total} · {v.item_count} {v.item_count === 1 ? "item" : "items"}
        </p>
      </div>
      {action && (
        <Link href={action.href} className={secondaryButton} aria-label={`${action.label}: ${v.pet.name}, ${v.owner_name}`}>
          {action.label} →
        </Link>
      )}
    </li>
  );
}
