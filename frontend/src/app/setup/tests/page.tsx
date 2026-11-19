"use client";

// Vet setup step 3 of 5: the tests already run for this visit (if any), with what each showed.
// They're billed today at the top of the bill, apart from the treatment plan, so step 4
// (/setup/template) leaves them out of the AI draft and the visit templates, and the results go to
// the AI draft as context. Tests not run here stay possible plan items.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader, PageIntro, StatusPage } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { api } from "@/lib/api";
import { searchTests } from "@/lib/catalog";
import { describePet } from "@/lib/pet";
import { money } from "@/lib/plan-math";
import { isPatientComplete, optionalNumber, updateDraft, useHydrated, useSetupDraft } from "@/lib/setup-draft";
import type { CatalogItem } from "@/lib/types";
import { card, ctaWrapper, focusRing, input, secondaryButton, sectionLabel } from "@/lib/ui";
import { PageSpinner, Spinner } from "@/components/Spinner";

export default function TestsStep() {
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const complete = isPatientComplete(draft);
  const [tests, setTests] = useState<CatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  // Step 1 must be filled in first (e.g. this page was opened directly).
  useEffect(() => {
    if (hydrated && !complete) router.replace("/setup");
  }, [hydrated, complete, router]);

  useEffect(() => {
    let cancelled = false;
    api
      .testCatalog()
      .then((ts) => {
        if (!cancelled) setTests(ts);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (!hydrated || !complete) return <Shell><PageSpinner /></Shell>;

  const pet = describePet({
    species: draft.species,
    age_years: optionalNumber(draft.age),
    breed: draft.breed.trim() || null,
    weight_lbs: optionalNumber(draft.weight),
  });
  const header = (
    <AppHeader
      title={`${draft.petName.trim()} · ${pet}`}
      subtitle={`Owner: ${draft.ownerName.trim()}`}
      note="Sample estimate"
      badge="Vet setup"
    />
  );

  if (loadError) {
    return (
      <StatusPage header={header}>
        <h1 className="text-2xl font-extrabold tracking-tight">Couldn&apos;t load the test list</h1>
        <p className="text-muted">Check that the Isthmus Care server is running, then try again.</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              setLoadError(false);
              setLoadAttempt((n) => n + 1);
            }}
            className={secondaryButton}
          >
            Try again
          </button>
          <Link href="/setup/template" className={secondaryButton}>
            Skip to the starting plan →
          </Link>
        </div>
      </StatusPage>
    );
  }

  const byId = new Map((tests ?? []).map((t) => [t.id, t]));
  // Drop tests the clinic has since removed from its price list.
  const ran = draft.tests.filter((t) => tests == null || byId.has(t.catalogId));
  const ranIds = new Set(ran.map((t) => t.catalogId));
  const results = tests ? searchTests(tests, query) : [];
  const total = ran.reduce((sum, t) => sum + (byId.get(t.catalogId)?.price ?? 0), 0);

  const add = (t: CatalogItem) => {
    if (ranIds.has(t.id)) return;
    updateDraft({ tests: [...draft.tests, { catalogId: t.id, result: "" }] });
    setQuery("");
    setNotice(`Added ${t.name}.`);
  };
  const remove = (catalogId: string) => {
    updateDraft({ tests: draft.tests.filter((t) => t.catalogId !== catalogId) });
    setNotice(`Removed ${byId.get(catalogId)?.name ?? catalogId}.`);
  };
  const setResult = (catalogId: string, result: string) =>
    updateDraft({ tests: draft.tests.map((t) => (t.catalogId === catalogId ? { ...t, result } : t)) });
  const next = () => router.push("/setup/template");

  return (
    <div className="flex-1 text-ink">
      {header}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <SetupStepper
          step={3}
          back={{ label: "Back: Symptoms", onClick: () => router.push("/setup/symptoms") }}
          forward={{ label: "Next: Visit template", onClick: next }}
        />
        <div className="mt-6">
          <PageIntro
            eyebrow="Step 3 of 5 · Vet setup"
            title={
              <>
                Any tests for <span className="text-badger">{draft.petName.trim()}</span> first?
              </>
            }
            subtitle="Add the tests you ran and what they showed. They're billed today at the top of the bill, and left out of the treatment plan. No tests needed? Skip ahead."
          />
        </div>

        <div className="mt-8 grid max-w-5xl gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
          <section aria-label="Find a test" className={`${card} self-start p-4`}>
            <h2 className={sectionLabel}>Add a test</h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search tests"
              placeholder="e.g. urinalysis, CBC, x-ray"
              className={`mt-3 ${input}`}
            />
            {tests == null ? (
              <div className="mt-3">
                <Spinner label="Loading tests" />
              </div>
            ) : (
              <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
                {results.length === 0 && <li className="py-3 text-sm text-muted">No test by that name.</li>}
                {results.map(({ item, alias }) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{item.name}</p>
                      <p className="text-xs text-muted">
                        <span className="font-medium text-slate tabular-nums">{money(item.price)}</span>
                        {alias && <> · matches “{alias}”</>}
                      </p>
                    </div>
                    {ranIds.has(item.id) ? (
                      <span className="shrink-0 text-xs text-muted">Added</span>
                    ) : (
                      <button
                        onClick={() => add(item)}
                        aria-label={`Add ${item.name}`}
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-lg font-semibold text-primary transition-[filter] hover:brightness-95 ${focusRing}`}
                      >
                        <span aria-hidden>+</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <section className={`${card} p-5 sm:p-6`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className={sectionLabel}>Tests run</h2>
                {ran.length > 0 && <span className="font-semibold tabular-nums">{money(total)}</span>}
              </div>
              {ran.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  None yet. Tests you don&apos;t run now can still go in the treatment plan.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted">Billed today, separate from the treatment plan.</p>
                  <ul className="mt-3 space-y-3">
                    {ran.map((t) => {
                      const item = byId.get(t.catalogId);
                      const name = item?.name ?? t.catalogId;
                      return (
                        <li key={t.catalogId} className="rounded-xl border border-line p-3">
                          <div className="flex items-center gap-3">
                            <p className="min-w-0 flex-1 font-semibold">{name}</p>
                            {item && <span className="text-sm text-slate tabular-nums">{money(item.price)}</span>}
                            <button
                              onClick={() => remove(t.catalogId)}
                              aria-label={`Remove ${name}`}
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-muted/70 hover:bg-essential-soft hover:text-bad ${focusRing}`}
                            >
                              ×
                            </button>
                          </div>
                          <label className="mt-2 block text-sm font-medium text-ink">
                            Results <span className="font-normal text-muted">(you can add them later too)</span>
                            <textarea
                              rows={2}
                              maxLength={2000}
                              value={t.result}
                              onChange={(e) => setResult(t.catalogId, e.target.value)}
                              placeholder="e.g. BUN 48, creatinine 2.4, USG 1.012"
                              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            <p className="sr-only" aria-live="polite">
              {notice}
            </p>

            <div className="flex justify-end">
              <button type="button" onClick={next} className={`w-full sm:w-auto ${ctaWrapper}`}>
                <ChromaticLabel className="px-8 py-3.5 text-base shadow-lg shadow-badger/30">
                  {ran.length ? "Next: see the plan options →" : "Skip: no tests →"}
                </ChromaticLabel>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 text-ink">
      <AppHeader title="New visit plan" subtitle="Step 3 of 5" note="Sample estimate" badge="Vet setup" />
      <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">{children}</main>
    </div>
  );
}
