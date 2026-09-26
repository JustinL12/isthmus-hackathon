"use client";

// Vet setup step 1 of 4: patient and owner. Step 2 (/setup/symptoms) takes the symptoms, step 3
// (/setup/template) picks the AI draft or a visit template, step 4 (/plan/[id]/arrange) sorts the items.
// Open with ?new=1 to start a blank visit; plain /setup resumes this tab's draft.

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, use, useEffect, useRef } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { resetDraft, updateDraft, useHydrated, useSetupDraft } from "@/lib/setup-draft";
import { card, ctaWrapper, fieldLabel, input, inputBase, sectionLabel, segmentOption, segmentTrack } from "@/lib/ui";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 text-ink">
      <AppHeader title="New visit plan" subtitle="Step 1 of 4" badge="Vet setup" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}

export default function PatientStep({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const fresh = use(searchParams).new != null;
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);

  // "Start a visit plan" links: clear the last visit, then drop ?new so back/reload resume instead.
  useEffect(() => {
    if (!fresh) return;
    resetDraft();
    router.replace("/setup");
  }, [fresh, router]);

  // Wait for the saved draft (browser only) so the form doesn't flash the defaults first.
  if (fresh || !hydrated) return <Shell><p className="text-muted">Loading…</p></Shell>;

  function next(e: FormEvent) {
    e.preventDefault(); // only reached once the browser's form validation passes
    router.push("/setup/symptoms");
  }

  const notBlank = { required: true, pattern: ".*\\S.*", title: "Required" }; // `required` alone accepts spaces
  return (
    <Shell>
      <SetupStepper
        step={1}
        forward={{ label: "Next: Symptoms", onClick: () => form.current?.requestSubmit() }}
      />
      <div className="mt-6">
        <PageIntro
          eyebrow="Step 1 of 4 · Vet setup"
          title={
            <>
              Who&apos;s <span className="text-badger">visiting</span> today?
            </>
          }
          subtitle="Start with the patient and owner. You'll enter the symptoms next."
        />
      </div>

      <form ref={form} onSubmit={next} className={`${card} mt-8 max-w-3xl space-y-5 p-5 sm:p-6`}>
        <h2 className={sectionLabel}>Patient and owner</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldLabel}>
            Pet name
            <input
              className={`mt-1 ${input}`}
              value={draft.petName}
              onChange={(e) => updateDraft({ petName: e.target.value })}
              {...notBlank}
            />
          </label>
          <fieldset>
            <legend className={fieldLabel}>Species</legend>
            <div className={`mt-1 grid-cols-2 ${segmentTrack}`}>
              {(["cat", "dog"] as const).map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center justify-center capitalize has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${segmentOption(
                    draft.species === s,
                  )}`}
                >
                  <input
                    type="radio"
                    name="species"
                    value={s}
                    checked={draft.species === s}
                    // A new species makes the picked template a poor default; step 2 picks again.
                    onChange={() => updateDraft({ species: s, templateId: s === draft.species ? draft.templateId : "" })}
                    className="sr-only"
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={fieldLabel}>
            Age (years)
            <input
              className={`mt-1 ${input}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={40}
              step="any"
              value={draft.age}
              onChange={(e) => updateDraft({ age: e.target.value })}
            />
          </label>
          <label className={fieldLabel}>
            Reason for visit <span className="font-normal text-muted">(optional)</span>
            <input
              className={`mt-1 ${input}`}
              value={draft.reason}
              onChange={(e) => updateDraft({ reason: e.target.value })}
              placeholder="e.g. Vomiting for 2 days"
            />
          </label>
          <label className={fieldLabel}>
            Owner name
            <input
              className={`mt-1 ${input}`}
              value={draft.ownerName}
              onChange={(e) => updateDraft({ ownerName: e.target.value })}
              {...notBlank}
            />
          </label>
          <label className={fieldLabel}>
            Owner&apos;s budget for today <span className="font-normal text-muted">(optional)</span>
            <span className="relative mt-1 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">$</span>
              <input
                className={`pl-7 pr-3 ${inputBase}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.budget}
                onChange={(e) => updateDraft({ budget: e.target.value })}
              />
            </span>
            <span className="mt-1 block text-sm font-normal text-muted">
              Leave blank if the owner would rather not say.
            </span>
          </label>
        </div>
        <p className="text-sm text-muted">If you leave the reason blank, the symptoms or visit template name is used.</p>
        <div className="flex justify-end">
          <button type="submit" className={`w-full sm:w-auto ${ctaWrapper}`}>
            <ChromaticLabel className="px-8 py-3.5 text-base shadow-lg shadow-badger/30">
              Next: symptoms →
            </ChromaticLabel>
          </button>
        </div>
      </form>
    </Shell>
  );
}
