"use client";

// Vet setup step 2 of 4: build the pet's symptom list (from the clinic's list, or new ones the
// vet types in, which are saved for everyone) plus optional notes for the AI. Step 3
// (/setup/template) shows the AI's draft for these symptoms next to the visit templates.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader, PageIntro, StatusPage } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { SymptomSearch } from "@/components/setup/SymptomSearch";
import { api, warmUp } from "@/lib/api";
import { isPatientComplete, optionalNumber, updateDraft, useHydrated, useSetupDraft } from "@/lib/setup-draft";
import type { Symptom } from "@/lib/types";
import { card, ctaWrapper, fieldLabel, focusRing, secondaryButton, sectionLabel } from "@/lib/ui";
import { PageSpinner, Spinner } from "@/components/Spinner";

export default function SymptomsStep() {
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const complete = isPatientComplete(draft);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notice, setNotice] = useState("");

  // Step 1 must be filled in first (e.g. this page was opened directly).
  useEffect(() => {
    if (hydrated && !complete) router.replace("/setup");
  }, [hydrated, complete, router]);

  // The AI draft on the next step queries Databricks, which can take a while to wake up.
  useEffect(warmUp, []);

  useEffect(() => {
    let cancelled = false;
    api
      .symptoms()
      .then((ss) => {
        if (!cancelled) setSymptoms(ss);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (!hydrated || !complete) return <Shell><PageSpinner /></Shell>;

  const age = optionalNumber(draft.age);
  const header = (
    <AppHeader
      title={`${draft.petName.trim()}${age != null ? ` · ${age}-year-old ${draft.species}` : ""}`}
      subtitle={`Owner: ${draft.ownerName.trim()}`}
      note="Sample estimate"
      badge="Vet setup"
    />
  );

  if (loadError) {
    return (
      <StatusPage header={header}>
        <h1 className="text-2xl font-extrabold tracking-tight">Couldn&apos;t load the symptom list</h1>
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
            Skip to visit templates →
          </Link>
        </div>
      </StatusPage>
    );
  }

  const byId = Object.fromEntries(symptoms.map((s) => [s.id, s]));
  const chosen = draft.symptoms.filter((id) => byId[id] || symptoms.length === 0); // drop ids the list no longer has
  const add = (s: Symptom) => {
    if (draft.symptoms.includes(s.id)) return;
    updateDraft({ symptoms: [...draft.symptoms, s.id] });
    setNotice(`Added ${s.label}.`);
  };
  const remove = (s: Symptom) => {
    updateDraft({ symptoms: draft.symptoms.filter((id) => id !== s.id) });
    setNotice(`Removed ${s.label}.`);
  };
  async function create(label: string) {
    const s = await api.addSymptom(label);
    setSymptoms((list) => (list.some((x) => x.id === s.id) ? list : [...list, s]));
    add(s);
  }
  const next = () => router.push("/setup/template");
  const nextLabel = chosen.length ? "Next: AI draft and templates" : "Next: Visit template";

  return (
    <div className="flex-1 text-ink">
      {header}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <SetupStepper
          step={2}
          back={{ label: "Back: Patient", onClick: () => router.push("/setup") }}
          forward={{ label: nextLabel, onClick: next }}
        />
        <div className="mt-6">
          <PageIntro
            eyebrow="Step 2 of 4 · Vet setup"
            title={
              <>
                What&apos;s going on with <span className="text-badger">{draft.petName.trim()}</span>?
              </>
            }
            subtitle="Add each symptom. Next, the app drafts a plan from similar past cases, next to the usual visit templates."
          />
        </div>

        <div className="mt-8 max-w-3xl space-y-4">
          {symptoms.length === 0 ? (
            <section className={`${card} p-5 sm:p-6`}>
              <Spinner label="Loading symptoms" />
            </section>
          ) : (
            <SymptomSearch
              symptoms={symptoms.filter((s) => s.species.includes(draft.species))}
              chosen={new Set(chosen)}
              onAdd={add}
              onCreate={create}
            />
          )}

          <section className={`${card} p-5 sm:p-6`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={sectionLabel}>Symptoms</h2>
              <span className="text-sm text-muted">{chosen.length ? `${chosen.length} added` : ""}</span>
            </div>
            {chosen.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                None added yet. Search above to add them, or skip ahead for a routine visit.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {chosen.map((id) => {
                  const s = byId[id] ?? { id, label: id, species: [] };
                  return (
                    <li key={id} className="flex items-center gap-3 py-2">
                      <p className="min-w-0 flex-1 font-semibold">{s.label}</p>
                      <button
                        onClick={() => remove(s)}
                        aria-label={`Remove ${s.label}`}
                        className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-muted/70 hover:bg-essential-soft hover:text-bad ${focusRing}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="sr-only" aria-live="polite">
            {notice}
          </p>

          <label className={`${card} block p-5 sm:p-6 ${fieldLabel}`}>
            Notes for the AI <span className="font-normal text-muted">(optional)</span>
            <textarea
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              rows={2}
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              placeholder="e.g. Vomiting for 2 days, still drinking, kidney values were borderline last year"
            />
          </label>

          <div className="flex justify-end">
            <button type="button" onClick={next} className={`w-full sm:w-auto ${ctaWrapper}`}>
              <ChromaticLabel className="px-8 py-3.5 text-base shadow-lg shadow-badger/30">
                {chosen.length ? "Next: see the plan options →" : "Next: visit template →"}
              </ChromaticLabel>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 text-ink">
      <AppHeader title="New visit plan" subtitle="Step 2 of 4" note="Sample estimate" badge="Vet setup" />
      <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">{children}</main>
    </div>
  );
}
