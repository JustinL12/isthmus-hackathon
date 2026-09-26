"use client";

// Vet setup step 2 of 3: pick the visit template, then build the plan (or return to the one
// already built from this same draft, keeping the vet's step 3 edits).

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
  type SetupDraft,
  isPatientComplete,
  optionalNumber,
  planRequest,
  requestKey,
  updateDraft,
  useHydrated,
  useSetupDraft,
} from "@/lib/setup-draft";
import type { CatalogItem, Template } from "@/lib/types";
import { card, ctaWrapper, quietLink, secondaryButton, sectionLabel } from "@/lib/ui";

const DEFAULT_TEMPLATE = "vomiting-senior-cat"; // the demo case

// The template to preselect: the demo case if it fits the species, else the first that does.
const defaultTemplate = (templates: Template[], species: SetupDraft["species"]) =>
  templates.find((t) => t.id === DEFAULT_TEMPLATE && t.species === species) ??
  templates.find((t) => t.species === species) ??
  templates[0] ??
  null;

function patientLine(d: SetupDraft) {
  const age = optionalNumber(d.age);
  return `${d.petName.trim()}${age != null ? ` · ${age}-year-old ${d.species}` : ""}`;
}

// Same patient context as PlanHeader shows once the plan exists (step 3, decision screen).
function Header({ draft }: { draft: SetupDraft }) {
  return (
    <AppHeader
      title={patientLine(draft)}
      subtitle={[draft.reason.trim(), `Owner: ${draft.ownerName.trim()}`].filter(Boolean).join(" · ")}
      note="Sample estimate"
      badge="Vet setup"
    />
  );
}

export default function TemplateStep() {
  const router = useRouter();
  const draft = useSetupDraft();
  const hydrated = useHydrated();
  const complete = isPatientComplete(draft);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({});
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);

  // Step 1 must be filled in first (e.g. this page was opened directly).
  useEffect(() => {
    if (hydrated && !complete) router.replace("/setup");
  }, [hydrated, complete, router]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.templates(), api.catalog()])
      .then(([ts, cs]) => {
        if (cancelled) return;
        setTemplates(ts);
        setCatalog(Object.fromEntries(cs.map((c) => [c.id, c])));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (!hydrated || !complete) return <StatusShell>Loading…</StatusShell>;

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
          <Link href="/setup" className={secondaryButton}>
            ← Back to patient info
          </Link>
        </div>
      </StatusPage>
    );
  }

  const selected = templates.find((t) => t.id === draft.templateId) ?? defaultTemplate(templates, draft.species);
  const body = selected ? planRequest(draft, selected) : null;
  const key = body ? requestKey(body) : null;
  const sameAsBuilt = draft.plan != null && draft.plan.key === key;
  // Built once already, but the patient details or template have changed since.
  const rebuild = draft.plan != null && !sameAsBuilt;

  async function build() {
    if (!selected || !body || !key || building) return;
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
        updateDraft({ templateId: selected.id });
      } else {
        const plan = await api.createPlan(body);
        planId = plan.id;
        updateDraft({ templateId: selected.id, plan: { id: plan.id, key } });
      }
      router.push(`/plan/${planId}/arrange?template=${encodeURIComponent(selected.id)}`);
    } catch {
      setBuildError(true);
      setBuilding(false);
    }
  }

  const matching = templates.filter((t) => t.species === draft.species);
  const others = templates.filter((t) => t.species !== draft.species);
  const forwardLabel = sameAsBuilt ? "Next: Sort items" : "Build plan";
  const age = optionalNumber(draft.age);
  const budget = optionalNumber(draft.budget);

  const templateCard = (t: Template) => {
    const items = t.item_ids.map((id) => catalog[id]).filter((c): c is CatalogItem => c != null);
    const checked = selected?.id === t.id;
    return (
      <label
        key={t.id}
        className={`block cursor-pointer rounded-2xl border bg-white p-5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
          checked ? "border-primary ring-2 ring-primary/25" : "border-line hover:border-ink/30"
        }`}
      >
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
              {checked && (
                <span aria-hidden className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                  ✓ Selected
                </span>
              )}
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

  return (
    <div className="flex-1 text-ink">
      <Header draft={draft} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <SetupStepper
          step={2}
          back={{ label: "Back: Patient", onClick: () => router.push("/setup"), disabled: building }}
          forward={{ label: forwardLabel, onClick: () => void build(), disabled: !selected || building }}
        />
        <div className="mt-6">
          <PageIntro
            eyebrow="Step 2 of 3 · Vet setup"
            title={
              <>
                Pick a <span className="text-badger">visit template</span>
              </>
            }
            subtitle={`It loads the usual items for ${draft.petName.trim()}'s visit. You can adjust every item next.`}
          />
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <fieldset className="min-w-0 space-y-6">
            <legend className="sr-only">Visit template</legend>
            {templates.length === 0 ? (
              <p className="text-muted">Loading templates…</p>
            ) : (
              <>
                <TemplateGroup title={matching.length ? `For ${draft.species}s` : "Visit templates"}>
                  {(matching.length ? matching : others).map(templateCard)}
                </TemplateGroup>
                {matching.length > 0 && others.length > 0 && (
                  <TemplateGroup title="Other templates">{others.map(templateCard)}</TemplateGroup>
                )}
              </>
            )}
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
              {draft.reason.trim() && (
                <div>
                  <dt className="sr-only">Reason for visit</dt>
                  <dd className="text-slate">{draft.reason.trim()}</dd>
                </div>
              )}
              <div className="pt-2">
                <dt className="inline text-muted">Owner: </dt>
                <dd className="inline">{draft.ownerName.trim()}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Budget today: </dt>
                <dd className="inline">{budget != null ? money(budget) : "Not given"}</dd>
              </div>
            </dl>
            <hr className="border-line" />
            {rebuild && (
              <p className="rounded-lg bg-soon-soft px-3 py-2 text-sm text-soon">
                The patient details or template changed since you built this plan. Continuing starts a fresh item
                list; changes made in step 3 won&apos;t carry over.
              </p>
            )}
            {buildError && (
              <p role="alert" className="text-sm text-bad">
                Couldn&apos;t build the plan. Check that the Isthmus Care server is running.
              </p>
            )}
            <button type="button" onClick={() => void build()} disabled={!selected || building} className={`w-full ${ctaWrapper}`}>
              <ChromaticLabel className="py-3.5 text-base shadow-lg shadow-badger/30">
                {building ? "Building plan…" : sameAsBuilt ? "Next: sort items →" : "Build plan →"}
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
      <AppHeader title="New visit plan" subtitle="Step 2 of 3" note="Sample estimate" badge="Vet setup" />
      <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">{children}</main>
    </div>
  );
}
