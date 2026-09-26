"use client";

// Vet setup step 2 of 4: the pet's symptoms (and optional notes for the AI). Step 3
// (/setup/template) shows the AI's draft for these symptoms next to the visit templates.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader, PageIntro, StatusPage } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { api, warmUp } from "@/lib/api";
import { isPatientComplete, optionalNumber, updateDraft, useHydrated, useSetupDraft } from "@/lib/setup-draft";
import type { Symptom } from "@/lib/types";
import { card, ctaWrapper, fieldLabel, secondaryButton, sectionLabel } from "@/lib/ui";

export default function SymptomsStep() {
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const complete = isPatientComplete(draft);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

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

  if (!hydrated || !complete) return <Shell>Loading…</Shell>;

  const age = optionalNumber(draft.age);
  const header = (
    <AppHeader
      title={`${draft.petName.trim()}${age != null ? ` · ${age}-year-old ${draft.species}` : ""}`}
      subtitle={[draft.reason.trim(), `Owner: ${draft.ownerName.trim()}`].filter(Boolean).join(" · ")}
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

  const toggle = (id: string) =>
    updateDraft({
      symptoms: draft.symptoms.includes(id) ? draft.symptoms.filter((s) => s !== id) : [...draft.symptoms, id],
    });
  const shown = symptoms.filter((s) => s.species.includes(draft.species));
  const next = () => router.push("/setup/template");
  const nextLabel = draft.symptoms.length ? "Next: AI draft and templates" : "Next: Visit template";

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
            subtitle="Tap every symptom that applies. Next, the app drafts a plan from similar past cases, next to the usual visit templates."
          />
        </div>

        <div className={`${card} mt-8 max-w-3xl space-y-5 p-5 sm:p-6`}>
          <fieldset>
            <legend className={sectionLabel}>Symptoms</legend>
            {symptoms.length === 0 ? (
              <p className="mt-3 text-muted">Loading symptoms…</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {shown.map((s) => {
                  const on = draft.symptoms.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                        on ? "border-primary bg-primary-soft text-primary" : "border-line bg-white hover:border-ink/30"
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="sr-only" />
                      {on && <span aria-hidden>✓</span>}
                      {s.label}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <label className={fieldLabel}>
            Notes for the AI <span className="font-normal text-muted">(optional)</span>
            <textarea
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              rows={2}
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              placeholder="e.g. Vomiting for 2 days, still drinking, kidney values were borderline last year"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {draft.symptoms.length
                ? `${draft.symptoms.length} selected`
                : "No symptoms (e.g. a routine visit)? Skip ahead to the visit templates."}
            </p>
            <button type="button" onClick={next} className={`w-full sm:w-auto ${ctaWrapper}`}>
              <ChromaticLabel className="px-8 py-3.5 text-base shadow-lg shadow-badger/30">
                {draft.symptoms.length ? "Next: see the plan options →" : "Next: visit template →"}
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
