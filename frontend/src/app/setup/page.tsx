"use client";

// Vet setup step 1: pick a visit template and enter pet/owner basics. Step 2 is /plan/[id]/arrange.
// TODO (stretch): "Upload estimate PDF" -> POST /api/ai/parse-estimate.

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { api } from "@/lib/api";
import { money } from "@/lib/plan-math";
import type { CatalogItem, Pet, Template } from "@/lib/types";

const DEFAULT_TEMPLATE = "vomiting-senior-cat"; // the demo case

// "" -> null; otherwise a finite number (the inputs' min/max already block bad values on submit).
const optionalNumber = (s: string) => (s.trim() === "" ? null : Number(s));

export default function SetupPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({});
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Prefilled with the demo persona (Alex and Mochi) so the demo takes a few taps.
  const [templateId, setTemplateId] = useState("");
  const [species, setSpecies] = useState<Pet["species"]>("cat");
  const [reason, setReason] = useState("");
  const [reasonEdited, setReasonEdited] = useState(false);
  const [petName, setPetName] = useState("Mochi");
  const [age, setAge] = useState("12");
  const [ownerName, setOwnerName] = useState("Alex");
  const [budget, setBudget] = useState("400");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.templates(), api.catalog()])
      .then(([ts, cs]) => {
        if (cancelled) return;
        setTemplates(ts);
        setCatalog(Object.fromEntries(cs.map((c) => [c.id, c])));
        const initial = ts.find((t) => t.id === DEFAULT_TEMPLATE) ?? ts[0];
        if (initial) {
          setTemplateId(initial.id);
          setSpecies(initial.species);
          setReason(initial.name);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  function pickTemplate(t: Template) {
    setTemplateId(t.id);
    setSpecies(t.species);
    if (!reasonEdited || !reason.trim()) {
      setReason(t.name);
      setReasonEdited(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const template = templates.find((t) => t.id === templateId);
    if (!template || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const plan = await api.createPlan({
        template_id: template.id,
        pet: {
          name: petName.trim(),
          species,
          age_years: optionalNumber(age),
          reason: reason.trim() || template.name,
        },
        owner_name: ownerName.trim(),
        budget: optionalNumber(budget),
      });
      router.push(`/plan/${plan.id}/arrange?template=${encodeURIComponent(template.id)}`);
    } catch {
      setSubmitError(true);
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-bold">Couldn&apos;t load visit templates</h1>
        <p className="text-gray-500">Check that the ClearCare server is running, then try again.</p>
        <button
          onClick={() => {
            setLoadError(false);
            setLoadAttempt((n) => n + 1);
          }}
          className="rounded-lg bg-foreground px-5 py-3 text-background"
        >
          Try again
        </button>
      </main>
    );
  }

  const field = "h-11 w-full rounded-lg border border-gray-300 bg-white text-black";
  const input = `mt-1 px-3 ${field}`;
  const notBlank = { required: true, pattern: ".*\\S.*", title: "Required" }; // `required` alone accepts spaces
  const label = "block font-medium";
  return (
    <main className="mx-auto w-full max-w-5xl p-6 md:p-8">
      <p className="text-sm font-medium text-gray-500">Vet setup · Step 1 of 2</p>
      <h1 className="text-2xl font-bold">New visit plan</h1>

      <form onSubmit={create} className="mt-6 grid gap-8 md:grid-cols-[3fr_2fr]">
        <fieldset>
          <legend className="text-lg font-semibold">Visit template</legend>
          <p className="text-sm text-gray-500">Loads the usual items for this visit. You can adjust them next.</p>
          {templates.length === 0 ? (
            <p className="mt-3 text-gray-500">Loading templates…</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {templates.map((t) => {
                const items = t.item_ids.map((id) => catalog[id]).filter((c): c is CatalogItem => c != null);
                const checked = templateId === t.id;
                return (
                  <label
                    key={t.id}
                    className={`block cursor-pointer rounded-xl border-2 p-4 text-black has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-500 ${
                      checked ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600" : "border-gray-200 bg-white hover:border-gray-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={checked}
                      onChange={() => pickTemplate(t)}
                      className="sr-only"
                    />
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">
                        {t.name}
                        {checked && (
                          <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 align-middle text-xs font-medium text-white">
                            Selected
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm text-gray-600 tabular-nums">
                        {items.length} items · {money(items.reduce((sum, c) => sum + c.price, 0))}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-gray-600">{items.map((c) => c.name).join(", ")}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Patient and owner</h2>
          <label className={label}>
            Pet name
            <input className={input} value={petName} onChange={(e) => setPetName(e.target.value)} {...notBlank} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <fieldset>
              <legend className={label}>Species</legend>
              <div className="mt-1 flex h-11 overflow-hidden rounded-lg border border-gray-300">
                {(["cat", "dog"] as const).map((s) => (
                  <label
                    key={s}
                    className={`flex flex-1 cursor-pointer items-center justify-center capitalize has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-blue-500 ${
                      species === s ? "bg-black text-white" : "bg-white text-black"
                    }`}
                  >
                    <input
                      type="radio"
                      name="species"
                      value={s}
                      checked={species === s}
                      onChange={() => setSpecies(s)}
                      className="sr-only"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={label}>
              Age (years)
              <input
                className={input}
                type="number"
                inputMode="decimal"
                min={0}
                max={40}
                step="any"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
          </div>
          <label className={label}>
            Reason for visit
            <input
              className={input}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonEdited(true);
              }}
              placeholder="e.g. Vomiting for 2 days"
            />
          </label>
          <label className={label}>
            Owner name
            <input className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} {...notBlank} />
          </label>
          <label className={label}>
            Owner&apos;s budget for today <span className="font-normal text-gray-500">(optional)</span>
            <span className="relative mt-1 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">$</span>
              <input
                className={`pl-7 pr-3 ${field}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </span>
            <span className="mt-1 block text-sm font-normal text-gray-500">
              Leave blank if the owner would rather not say.
            </span>
          </label>

          {submitError && (
            <p role="alert" className="text-red-600">
              Couldn&apos;t create the plan. Check that the ClearCare server is running.
            </p>
          )}
          <button
            type="submit"
            disabled={!templateId || submitting}
            className="h-12 w-full rounded-lg bg-foreground px-5 font-medium text-background disabled:opacity-50"
          >
            {submitting ? "Building plan…" : "Build plan →"}
          </button>
          <Disclaimer />
        </div>
      </form>
    </main>
  );
}
