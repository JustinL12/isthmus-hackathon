"use client";

// Vet setup step 2: confirm the suggested groups (drag, or each card's group picker), add items
// from the clinic price list, remove items, and leave notes for the owner. Changes save as you go.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { AppHeader, PageIntro, PlanHeader, StatusPage } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { CatalogSearch } from "@/components/setup/CatalogSearch";
import { SetupBoard } from "@/components/setup/SetupBoard";
import { SetupStepper } from "@/components/setup/SetupStepper";
import { Disclaimer } from "@/components/Disclaimer";
import { ApiError, api } from "@/lib/api";
import { planItemFromCatalog, suggestedGroup } from "@/lib/catalog";
import { fullTotal, money } from "@/lib/plan-math";
import { draftFromPlan, getDraft, setDraft } from "@/lib/setup-draft";
import type { CatalogItem, Explanation, Group, Plan, PlanItem } from "@/lib/types";
import { GROUPS } from "@/lib/types";
import { card, ctaWrapper, focusRing, secondaryButton, sectionLabel } from "@/lib/ui";
import { usePlanItemsSaver } from "@/lib/use-plan-items-saver";

export default function ArrangePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = use(params);
  const template = use(searchParams).template; // visit template, for suggesting groups of added items
  const templateId = typeof template === "string" ? template : null;
  const router = useRouter();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [explanations, setExplanations] = useState<Record<string, Explanation>>({});
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [focused, setFocused] = useState<Group>("essential"); // the expanded group on the board
  const [removed, setRemoved] = useState<{ item: PlanItem; index: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState<"back" | "review" | null>(null); // saving before leaving the page
  const { save, flush, status, error } = usePlanItemsSaver(id);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getPlan(id), api.catalog(), api.explanations()])
      .then(([p, c, e]) => {
        if (cancelled) return;
        setPlan(p);
        setItems(p.items);
        setCatalog(c);
        setExplanations(e);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadAttempt]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (status === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  if (loadError) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <StatusPage header={<AppHeader note="Sample estimate" badge="Vet setup" />}>
        <h1 className="text-2xl font-extrabold tracking-tight">{missing ? "Plan not found" : "Couldn't load this plan"}</h1>
        <p className="text-muted">
          {missing
            ? "It may have been cleared when the server restarted. Start a new plan from a template."
            : "Check that the Isthmus Care server is running, then try again."}
        </p>
        <div className="flex flex-wrap gap-3">
          {!missing && (
            <button
              onClick={() => {
                setLoadError(null);
                setLoadAttempt((n) => n + 1);
              }}
              className={secondaryButton}
            >
              Try again
            </button>
          )}
          <Link href="/setup?new=1" className={secondaryButton}>
            Start a new plan
          </Link>
        </div>
      </StatusPage>
    );
  }

  if (!plan)
    return (
      <div className="flex-1 text-ink">
        <AppHeader note="Sample estimate" badge="Vet setup" />
        <main className="mx-auto max-w-7xl px-4 py-6 text-muted sm:px-8">Loading…</main>
      </div>
    );

  if (plan.status === "agreed") {
    return (
      <StatusPage header={<PlanHeader plan={plan} note="Sample estimate" badge="Vet setup" />}>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span className="text-badger">{plan.pet.name}&apos;s</span> plan is already agreed
        </h1>
        <p className="text-muted">Agreed plans can&apos;t be changed. Start a new plan to make changes.</p>
        <div className="flex flex-wrap items-center gap-3">
          {plan.share_token && (
            <Link href={`/summary/${plan.share_token}`} className={secondaryButton}>
              View summary
            </Link>
          )}
          <Link href="/setup?new=1" className={secondaryButton}>
            Start a new plan
          </Link>
        </div>
      </StatusPage>
    );
  }

  const commit = (next: PlanItem[]) => {
    setItems(next);
    save(next);
  };

  const move = (itemId: string, group: Group) =>
    commit(items.map((i) => (i.id === itemId ? { ...i, group } : i)));

  const setNote = (itemId: string, vet_note: string | null) =>
    commit(items.map((i) => (i.id === itemId ? { ...i, vet_note } : i)));

  const remove = (itemId: string) => {
    const index = items.findIndex((i) => i.id === itemId);
    if (index < 0) return;
    setRemoved({ item: items[index], index });
    setNotice(`Removed ${items[index].name}.`);
    commit(items.filter((i) => i.id !== itemId));
  };

  const undoRemove = () => {
    if (!removed) return;
    setRemoved(null);
    if (items.some((i) => i.catalog_id === removed.item.catalog_id)) return; // re-added from the price list
    const next = [...items];
    next.splice(Math.min(removed.index, next.length), 0, removed.item);
    setNotice(`Restored ${removed.item.name}.`);
    setFocused(removed.item.group);
    commit(next);
  };

  const add = (c: CatalogItem) => {
    if (items.some((i) => i.catalog_id === c.id)) return;
    const group = suggestedGroup(c, templateId);
    if (removed?.item.catalog_id === c.id) setRemoved(null);
    setNotice(`Added ${c.name} to ${GROUPS.find((g) => g.id === group)?.label}.`);
    setFocused(group); // show where it landed
    commit([...items, planItemFromCatalog(c, group, explanations)]);
  };

  async function review() {
    setLeaving("review");
    if (await flush()) router.push(`/plan/${id}`);
    else setLeaving(null);
  }

  // Back to step 2. Its "Next" returns to this plan when this tab's draft is the one that built
  // it; otherwise (plan opened from a link) rebuild the draft from the plan first.
  const back = async () => {
    setLeaving("back");
    if (!(await flush())) return setLeaving(null);
    if (getDraft().plan?.id !== id) setDraft(draftFromPlan(plan, templateId));
    router.push("/setup/template");
  };

  const codes = Object.fromEntries(catalog.map((c) => [c.id, c.code]));
  const inPlan = new Set(items.map((i) => i.catalog_id));
  const total = fullTotal(items);
  const essential = items.filter((i) => i.group === "essential").reduce((sum, i) => sum + i.price, 0);
  const { pet } = plan;

  return (
    <div className="flex-1 text-ink">
      <PlanHeader plan={plan} note="Sample estimate" badge="Vet setup" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-8">
        <SetupStepper
          step={3}
          back={{ label: "Back: Visit template", onClick: () => void back(), disabled: leaving != null }}
          forward={{
            label: `Next: Review with ${plan.owner_name}`,
            onClick: () => void review(),
            disabled: leaving != null || items.length === 0,
          }}
        />
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <PageIntro
            eyebrow="Step 3 of 3 · Vet setup"
            title={
              <>
                <span className="text-badger">{pet.name}&apos;s</span> estimate
              </>
            }
            subtitle={`Sort each item into a group, then review the plan with ${plan.owner_name}.`}
          />
          <dl className={`${card} flex gap-8 self-start p-5 md:self-end`}>
            <div>
              <dt className={sectionLabel}>Full estimate</dt>
              <dd className="font-serif text-4xl tabular-nums">{money(total)}</dd>
            </div>
            <div>
              <dt className={sectionLabel}>Essential now</dt>
              <dd
                className={`font-serif text-4xl tabular-nums ${
                  plan.budget == null ? "" : essential > plan.budget ? "text-bad" : "text-good"
                }`}
              >
                {money(essential)}
              </dd>
              {plan.budget != null && (
                <dd className="text-sm text-slate">
                  {plan.owner_name}&apos;s budget: {money(plan.budget)}
                </dd>
              )}
            </div>
          </dl>
        </div>

        <p className="text-sm text-slate">
          The app suggested a group for each item. Tap a group to open it, and drag items onto another group (or use
          each card&apos;s group menu) to move them. Then review the plan with {plan.owner_name}.
        </p>

        {adding ? (
          <CatalogSearch
            catalog={catalog}
            templateId={templateId}
            inPlan={inPlan}
            onAdd={add}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className={`inline-flex h-11 items-center rounded-xl border border-dashed border-ink/25 bg-white/60 px-4 text-sm font-medium text-ink transition-colors hover:border-ink/40 hover:bg-white ${focusRing}`}
          >
            + Add item from price list
          </button>
        )}

        <SetupBoard
          items={items}
          codes={codes}
          focused={focused}
          onFocus={setFocused}
          onMove={move}
          onRemove={remove}
          onNote={setNote}
        />

        <Disclaimer />

        <footer className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <p className="sr-only" aria-live="polite">
              {notice}
            </p>
            {removed && (
              <span>
                Removed {removed.item.name}.{" "}
                <button onClick={undoRemove} className="font-semibold text-primary underline underline-offset-2">
                  Undo
                </button>
              </span>
            )}
            <SaveStatusText status={status} error={error} onRetry={() => void flush()} />
          </div>
          <div className="flex items-center gap-3">
            {items.length === 0 && <span className="text-sm text-muted">Add at least one item.</span>}
            <button onClick={review} disabled={leaving != null || items.length === 0} className={ctaWrapper}>
              <ChromaticLabel className="shadow-lg shadow-badger/30">
                {leaving === "review" ? "Saving…" : `Review with ${plan.owner_name} →`}
              </ChromaticLabel>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

function SaveStatusText({
  status,
  error,
  onRetry,
}: {
  status: "saved" | "saving" | "error";
  error: unknown;
  onRetry: () => void;
}) {
  if (status === "saving") return <span className="text-muted">Saving…</span>;
  if (status === "saved") return <span className="text-muted">All changes saved</span>;

  const code = error instanceof ApiError ? error.status : null;
  if (code === 409) return <span className="text-bad">This plan was already agreed, so changes can&apos;t be saved.</span>;
  if (code === 404) return <span className="text-bad">This plan no longer exists on the server. Start a new plan.</span>;
  return (
    <span className="text-bad">
      Couldn&apos;t save changes.{" "}
      <button onClick={onRetry} className="font-semibold underline">
        Retry
      </button>
    </span>
  );
}
