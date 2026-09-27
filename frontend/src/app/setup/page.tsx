"use client";

// Vet setup step 1 of 4: patient and owner. Step 2 (/setup/symptoms) takes the symptoms, step 3
// (/setup/template) picks the AI draft or a visit template, step 4 (/plan/[id]/arrange) sorts the items.
// Open with ?new=1 to start a blank visit, or ?demo=1 for the Mochi demo; plain /setup resumes this tab's draft.

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, use, useEffect, useRef } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { SpeciesSearch } from "@/components/setup/SpeciesSearch";
import { breedsFor } from "@/lib/breeds";
import { MAX_WEIGHT_LBS, resetDraft, updateDraft, useHydrated, useSetupDraft } from "@/lib/setup-draft";
import { card, ctaWrapper, fieldLabel, input, inputBase, sectionLabel } from "@/lib/ui";
import { PageSpinner } from "@/components/Spinner";

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
  const query = use(searchParams);
  const demo = query.demo != null;
  const fresh = query.new != null || demo;
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);

  // "Start a visit plan" and "Open the Mochi demo" links: replace the last visit, then drop the
  // query so back/reload resume instead.
  useEffect(() => {
    if (!fresh) return;
    resetDraft(demo);
    router.replace("/setup");
  }, [fresh, demo, router]);

  // Wait for the saved draft (browser only) so the form doesn't flash the defaults first.
  if (fresh || !hydrated) return <Shell><PageSpinner /></Shell>;

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
          <div>
            <label htmlFor="species" className={fieldLabel}>
              Species
            </label>
            <SpeciesSearch
              id="species"
              value={draft.species}
              // A new species makes the picked template and the breed wrong; step 3 picks again.
              onChange={(species) => updateDraft({ species, templateId: "", breed: "" })}
            />
          </div>
          <label className={fieldLabel}>
            {draft.species === "other" ? "What kind of animal" : "Breed"}{" "}
            <span className="font-normal text-muted">(optional)</span>
            <input
              className={`mt-1 ${input}`}
              list="breed-options"
              maxLength={60}
              autoComplete="off"
              value={draft.breed}
              onChange={(e) => updateDraft({ breed: e.target.value })}
            />
            <datalist id="breed-options">
              {breedsFor(draft.species).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-4">
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
              Weight (lbs)
              <input
                className={`mt-1 ${input}`}
                type="number"
                inputMode="decimal"
                min={0.1}
                max={MAX_WEIGHT_LBS}
                step="any"
                value={draft.weight}
                onChange={(e) => updateDraft({ weight: e.target.value })}
              />
            </label>
          </div>
          <p className="-mt-2 text-sm font-normal text-muted sm:col-span-2">
            Breed, age and weight help the AI match past visits and pick templates for pets like this one.
          </p>
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
