"use client";

// Vet setup step 3 of 4: pick the AI's draft for the symptoms from step 2, or a visit template,
// then build the plan (or return to the one already built from this same draft, keeping the
// vet's step 4 edits).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader, PageIntro, StatusPage } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { Disclaimer } from "@/components/Disclaimer";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { ApiError, api } from "@/lib/api";
import { money } from "@/lib/plan-math";
import {
  AI_DRAFT,
  SKIP_TEMPLATE,
  type SetupDraft,
  isPatientComplete,
  optionalNumber,
  planRequest,
  requestKey,
  updateDraft,
  useHydrated,
  useSetupDraft,
} from "@/lib/setup-draft";
import type { CatalogItem, CreatePlanRequest, SuggestRequest, SuggestResponse, Template } from "@/lib/types";
import { card, ctaWrapper, quietLink, secondaryButton, sectionLabel } from "@/lib/ui";
import { PageSpinner, Spinner } from "@/components/Spinner";

const DEFAULT_TEMPLATE = "vomiting-senior-cat"; // the demo case

// AI drafts by request, so going back and forth between steps doesn't ask Claude again.
const suggestions = new Map<string, SuggestResponse>();

const overlap = (t: Template, symptoms: string[]) => t.symptoms.filter((s) => symptoms.includes(s)).length;

// The template to preselect: best symptom match for the species, else the demo case, else the first that fits.
function defaultTemplate(templates: Template[], d: SetupDraft) {
  const fits = templates.filter((t) => t.species === d.species);
  const best = [...fits].sort((a, b) => overlap(b, d.symptoms) - overlap(a, d.symptoms))[0];
  if (best && overlap(best, d.symptoms) > 0) return best;
  return fits.find((t) => t.id === DEFAULT_TEMPLATE) ?? fits[0] ?? templates[0] ?? null;
}

function patientLine(d: SetupDraft) {
  const age = optionalNumber(d.age);
  return `${d.petName.trim()}${age != null ? ` · ${age}-year-old ${d.species}` : ""}`;
}

// Same patient context as PlanHeader shows once the plan exists (step 4, decision screen).
function Header({ draft }: { draft: SetupDraft }) {
  return (
    <AppHeader
      title={patientLine(draft)}
      subtitle={`Owner: ${draft.ownerName.trim()}`}
      note="Sample estimate"
      badge="Vet setup"
    />
  );
}

type AiState = { status: "off" } | { status: "loading" } | { status: "error" } | { status: "done"; res: SuggestResponse };

export default function TemplateStep() {
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const complete = isPatientComplete(draft);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({});
  const [symptomLabels, setSymptomLabels] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [aiResults, setAiResults] = useState<Record<string, SuggestResponse | "error">>({});
  const [aiAttempt, setAiAttempt] = useState(0);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);

  // Step 1 must be filled in first (e.g. this page was opened directly).
  useEffect(() => {
    if (hydrated && !complete) router.replace("/setup");
  }, [hydrated, complete, router]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.templates(), api.catalog(), api.symptoms()])
      .then(([ts, cs, ss]) => {
        if (cancelled) return;
        setTemplates(ts);
        setCatalog(Object.fromEntries(cs.map((c) => [c.id, c])));
        setSymptomLabels(Object.fromEntries(ss.map((s) => [s.id, s.label])));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Ask for the AI draft (Databricks similar cases + Claude); takes a few seconds.
  const aiRequest: SuggestRequest | null =
    hydrated && draft.symptoms.length
      ? { species: draft.species, age_years: optionalNumber(draft.age), symptoms: draft.symptoms, notes: draft.notes.trim() || null }
      : null;
  const aiKey = aiRequest ? JSON.stringify(aiRequest) : null;
  useEffect(() => {
    if (!aiKey || suggestions.has(aiKey)) return;
    let cancelled = false;
    api
      .suggest(JSON.parse(aiKey))
      .then((res) => {
        suggestions.set(aiKey, res);
        if (!cancelled) setAiResults((r) => ({ ...r, [aiKey]: res }));
      })
      .catch(() => {
        if (!cancelled) setAiResults((r) => ({ ...r, [aiKey]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [aiKey, aiAttempt]);
  const aiResult = aiKey ? (suggestions.get(aiKey) ?? aiResults[aiKey]) : undefined;
  const ai: AiState = !aiKey
    ? { status: "off" }
    : aiResult === "error"
      ? { status: "error" }
      : aiResult
        ? { status: "done", res: aiResult }
        : { status: "loading" };
  const retryAi = () => {
    setAiResults((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== aiKey)));
    setAiAttempt((n) => n + 1);
  };

  if (!hydrated || !complete) return <StatusShell><PageSpinner /></StatusShell>;

  if (loadError) {
    return (
      <StatusPage header={<Header draft={draft} />}>
        <h1 className="text-2xl font-extrabold tracking-tight">Couldn&apos;t load visit templates</h1>
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
          <Link href="/setup/symptoms" className={secondaryButton}>
            ← Back to symptoms
          </Link>
        </div>
      </StatusPage>
    );
  }

  // The AI draft counts only when it really came from similar cases; with Databricks down the
  // backend falls back to a template, which the template list below already offers.
  const aiDraft = ai.status === "done" && ai.res.source.startsWith("databricks") && ai.res.items.length ? ai.res : null;
  const aiPending = ai.status === "loading";
  const aiAvailable = aiDraft != null || aiPending;

  const symptomText = draft.symptoms.map((s) => symptomLabels[s] ?? s).join(", ");
  const aiName = symptomText ? symptomText.charAt(0).toUpperCase() + symptomText.slice(1).toLowerCase() : "AI draft";
  // The visit reason the owner sees: the symptoms, else what the vet started from.
  const visitReason = (fallback: string) => (symptomText ? aiName : fallback);
  const pickedTemplate = templates.find((t) => t.id === draft.templateId);
  // Explicit pick, else the AI draft when there are symptoms, else the best template.
  const choice: string | null =
    draft.templateId === AI_DRAFT && aiAvailable
      ? AI_DRAFT
      : draft.templateId === SKIP_TEMPLATE
        ? SKIP_TEMPLATE
        : pickedTemplate
          ? pickedTemplate.id
          : aiAvailable && draft.templateId !== AI_DRAFT
            ? AI_DRAFT
            : (defaultTemplate(templates, draft)?.id ?? null);
  const selected = templates.find((t) => t.id === choice) ?? null;
  // Template that suggests groups for items the vet adds in step 4.
  const aiFallbackId = ai.status === "done" ? ai.res.fallback_template_id : null;
  const hintTemplate = selected ?? templates.find((t) => t.id === aiFallbackId) ?? defaultTemplate(templates, draft);

  const body: CreatePlanRequest | null =
    choice === AI_DRAFT || choice === SKIP_TEMPLATE
      ? planRequest(draft, { id: choice, reason: visitReason("General visit") })
      : selected
        ? planRequest(draft, { id: selected.id, reason: visitReason(selected.name) })
        : null;
  const key = body ? requestKey(body) : null;
  const sameAsBuilt = draft.plan != null && draft.plan.key === key;
  // Built once already, but the patient details, symptoms or choice have changed since.
  const rebuild = draft.plan != null && !sameAsBuilt;
  const ready = body != null && (choice !== AI_DRAFT || aiDraft != null || sameAsBuilt);

  async function build() {
    if (!body || !key || !choice || !ready || building) return;
    setBuilding(true);
    setBuildError(false);
    try {
      let planId: string | null = null;
      if (draft.plan && draft.plan.key === key) {
        // Return to the plan built from this same draft, if it can still be edited.
        try {
          const existing = await api.getPlan(draft.plan.id);
          if (existing.status === "draft") planId = existing.id;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e; // 404: cleared by a server restart
        }
      }
      if (planId) {
        updateDraft({ templateId: choice });
      } else {
        if (choice === AI_DRAFT && !aiDraft) throw new Error("AI draft not ready");
        const request: CreatePlanRequest =
          aiDraft && choice === AI_DRAFT
            ? {
                ...body,
                template_id: undefined,
                items: aiDraft.items.map(({ catalog_id, group, reason }) => ({ catalog_id, group, reason })),
              }
            : choice === SKIP_TEMPLATE
              ? { ...body, template_id: undefined, items: [] } // empty plan; the vet adds items in step 4
              : body;
        const plan = await api.createPlan(request);
        planId = plan.id;
        updateDraft({ templateId: choice, plan: { id: plan.id, key } });
      }
      router.push(`/plan/${planId}/arrange${hintTemplate ? `?template=${encodeURIComponent(hintTemplate.id)}` : ""}`);
    } catch {
      setBuildError(true);
      setBuilding(false);
    }
  }

  const byMatch = (a: Template, b: Template) => overlap(b, draft.symptoms) - overlap(a, draft.symptoms);
  const matching = templates.filter((t) => t.species === draft.species).sort(byMatch);
  const others = templates.filter((t) => t.species !== draft.species);
  const forwardLabel = sameAsBuilt ? "Next: Sort items" : "Build plan";
  const age = optionalNumber(draft.age);
  const budget = optionalNumber(draft.budget);

  const optionClass = (checked: boolean) =>
    `block cursor-pointer rounded-2xl border bg-white p-5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
      checked ? "border-primary ring-2 ring-primary/25" : "border-line hover:border-ink/30"
    }`;
  const selectedTag = (
    <span aria-hidden className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
      ✓ Selected
    </span>
  );

  const templateCard = (t: Template) => {
    const items = t.item_ids.map((id) => catalog[id]).filter((c): c is CatalogItem => c != null);
    const checked = choice === t.id;
    const matches = overlap(t, draft.symptoms);
    return (
      <label key={t.id} className={optionClass(checked)}>
        <input
          type="radio"
          name="template"
          value={t.id}
          checked={checked}
          onChange={() => updateDraft({ templateId: t.id })}
          className="sr-only"
        />
        <span className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{t.name}</span>
              {matches > 0 && (
                <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-slate">
                  Matches {matches} symptom{matches === 1 ? "" : "s"}
                </span>
              )}
              {checked && selectedTag}
            </span>
            <span className="mt-1 block text-sm text-slate">{items.map((c) => c.name).join(", ")}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-serif text-3xl leading-none tabular-nums">
              {money(items.reduce((sum, c) => sum + c.price, 0))}
            </span>
            <span className="mt-1 block text-xs text-muted">{items.length} items</span>
          </span>
        </span>
      </label>
    );
  };

  const aiCard = () => {
    if (ai.status === "off") return null;
    if (!aiAvailable) {
      return (
        <div className={`${card} space-y-2 p-5`}>
          <p className="font-semibold">AI draft unavailable</p>
          <p className="text-sm text-slate">
            {ai.status === "error"
              ? "Couldn't reach the suggestion service. Pick a visit template below."
              : "Not enough similar past cases for these symptoms yet. Pick a visit template below."}
          </p>
          {ai.status === "error" && (
            <button onClick={retryAi} className={secondaryButton}>
              Try again
            </button>
          )}
        </div>
      );
    }
    const checked = choice === AI_DRAFT;
    return (
      <label className={optionClass(checked)}>
        <input
          type="radio"
          name="template"
          value={AI_DRAFT}
          checked={checked}
          onChange={() => updateDraft({ templateId: AI_DRAFT })}
          className="sr-only"
        />
        <span className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-badger px-2 py-0.5 text-xs font-semibold text-white">AI draft</span>
              <span className="text-lg font-semibold">{aiName}</span>
              {checked && selectedTag}
            </span>
            {aiDraft ? (
              <>
                <span className="mt-1 block text-sm text-slate">{aiDraft.items.map((i) => i.name).join(", ")}</span>
                <span className="mt-2 block text-xs text-muted">
                  Based on {aiDraft.similar_case_count} similar past cases
                  {aiDraft.vet_case_count > 0 && `, ${aiDraft.vet_case_count} from this clinic's vets`}. Your changes
                  in the next step teach future drafts.
                </span>
              </>
            ) : (
              <span aria-live="polite" className="mt-1 block animate-pulse text-sm text-slate">
                Finding similar cases and drafting a plan…
              </span>
            )}
          </span>
          {aiDraft && (
            <span className="shrink-0 text-right">
              <span className="block font-serif text-3xl leading-none tabular-nums">
                {money(aiDraft.items.reduce((sum, i) => sum + i.price, 0))}
              </span>
              <span className="mt-1 block text-xs text-muted">{aiDraft.items.length} items</span>
            </span>
          )}
        </span>
      </label>
    );
  };

  return (
    <div className="flex-1 text-ink">
      <Header draft={draft} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <SetupStepper
          step={3}
          back={{ label: "Back: Symptoms", onClick: () => router.push("/setup/symptoms"), disabled: building }}
          forward={{ label: forwardLabel, onClick: () => void build(), disabled: !ready || building }}
        />
        <div className="mt-6">
          <PageIntro
            eyebrow="Step 3 of 4 · Vet setup"
            title={
              <>
                Pick a <span className="text-badger">starting plan</span>
              </>
            }
            subtitle={`Start from the AI's draft for ${draft.petName.trim()}'s symptoms, a usual visit template, or nothing at all. You can adjust every item next.`}
          />
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <fieldset className="min-w-0 space-y-6">
            <legend className="sr-only">Starting plan</legend>
            {ai.status !== "off" && <TemplateGroup title="From the symptoms">{aiCard()}</TemplateGroup>}
            {templates.length === 0 ? (
              <Spinner label="Loading templates" />
            ) : (
              <>
                <TemplateGroup title={matching.length ? `Visit templates for ${draft.species}s` : "Visit templates"}>
                  {(matching.length ? matching : others).map(templateCard)}
                </TemplateGroup>
                {matching.length > 0 && others.length > 0 && (
                  <TemplateGroup title="Other templates">{others.map(templateCard)}</TemplateGroup>
                )}
              </>
            )}
            <TemplateGroup title="No template">
              <label className={optionClass(choice === SKIP_TEMPLATE)}>
                <input
                  type="radio"
                  name="template"
                  value={SKIP_TEMPLATE}
                  checked={choice === SKIP_TEMPLATE}
                  onChange={() => updateDraft({ templateId: SKIP_TEMPLATE })}
                  className="sr-only"
                />
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">Skip template</span>
                  {choice === SKIP_TEMPLATE && selectedTag}
                </span>
                <span className="mt-1 block text-sm text-slate">
                  Start with an empty plan and add each item from the price list yourself.
                </span>
              </label>
            </TemplateGroup>
          </fieldset>

          <aside className={`${card} space-y-4 self-start p-5 md:sticky md:top-6`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={sectionLabel}>Patient</h2>
              <Link href="/setup" className={quietLink}>
                Edit
              </Link>
            </div>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="sr-only">Pet</dt>
                <dd className="text-lg font-semibold">{draft.petName.trim()}</dd>
                <dd className="text-slate">{age != null ? `${age}-year-old ${draft.species}` : draft.species}</dd>
              </div>
              <div className="pt-2">
                <dt className="inline text-muted">Owner: </dt>
                <dd className="inline">{draft.ownerName.trim()}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Budget today: </dt>
                <dd className="inline">{budget != null ? money(budget) : "Not given"}</dd>
              </div>
            </dl>
            <div className="flex items-baseline justify-between gap-3 pt-2">
              <h2 className={sectionLabel}>Symptoms</h2>
              <Link href="/setup/symptoms" className={quietLink}>
                Edit
              </Link>
            </div>
            <p className="text-sm text-slate">{symptomText || "None entered"}</p>
            <hr className="border-line" />
            {rebuild && (
              <p className="rounded-lg bg-soon-soft px-3 py-2 text-sm text-soon">
                The patient details, symptoms or starting plan changed since you built this plan. Continuing starts a
                fresh item list; changes made in step 4 won&apos;t carry over.
              </p>
            )}
            {buildError && (
              <p role="alert" className="text-sm text-bad">
                Couldn&apos;t build the plan. Check that the Isthmus Care server is running.
              </p>
            )}
            <button type="button" onClick={() => void build()} disabled={!ready || building} className={`w-full ${ctaWrapper}`}>
              <ChromaticLabel className="py-3.5 text-base shadow-lg shadow-badger/30">
                {building
                  ? "Building plan…"
                  : !ready && aiPending
                    ? "Drafting…"
                    : sameAsBuilt
                      ? "Next: sort items →"
                      : "Build plan →"}
              </ChromaticLabel>
            </button>
            <Disclaimer />
          </aside>
        </div>
      </main>
    </div>
  );
}

function TemplateGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={sectionLabel}>{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function StatusShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 text-ink">
      <AppHeader title="New visit plan" subtitle="Step 3 of 4" note="Sample estimate" badge="Vet setup" />
      <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">{children}</main>
    </div>
  );
}
