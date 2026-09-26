"use client";

// Vet setup step 2: confirm the suggested groups (drag, or each card's group picker), add items
// from the clinic price list, remove items, and leave notes for the owner. Changes save as you go.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { CatalogSearch } from "@/components/setup/CatalogSearch";
import { SetupBoard } from "@/components/setup/SetupBoard";
import { Disclaimer } from "@/components/Disclaimer";
import { ApiError, api } from "@/lib/api";
import { planItemFromCatalog, suggestedGroup } from "@/lib/catalog";
import { fullTotal, money } from "@/lib/plan-math";
import type { CatalogItem, Explanation, Group, Plan, PlanItem } from "@/lib/types";
import { GROUPS } from "@/lib/types";
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
  const [leaving, setLeaving] = useState(false);
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
      <main className="mx-auto w-full max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-bold">{missing ? "Plan not found" : "Couldn't load this plan"}</h1>
        <p className="text-gray-500">
          {missing
            ? "It may have been cleared when the server restarted. Start a new plan from a template."
            : "Check that the Isthmus Care server is running, then try again."}
        </p>
        <div className="flex gap-3">
          {!missing && (
            <button
              onClick={() => {
                setLoadError(null);
                setLoadAttempt((n) => n + 1);
              }}
              className="rounded-lg bg-foreground px-5 py-3 text-background"
            >
              Try again
            </button>
          )}
          <Link href="/setup" className="rounded-lg border px-5 py-3">
            Start a new plan
          </Link>
        </div>
      </main>
    );
  }

  if (!plan) return <main className="p-8">Loading…</main>;

  if (plan.status === "agreed") {
    return (
      <main className="mx-auto w-full max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-bold">{plan.pet.name}&apos;s plan is already agreed</h1>
        <p className="text-gray-500">Agreed plans can&apos;t be changed. Start a new plan to make changes.</p>
        <div className="flex gap-3">
          {plan.share_token && (
            <Link href={`/summary/${plan.share_token}`} className="rounded-lg bg-foreground px-5 py-3 text-background">
              View summary
            </Link>
          )}
          <Link href="/setup" className="rounded-lg border px-5 py-3">
            Start a new plan
          </Link>
        </div>
      </main>
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
    setLeaving(true);
    if (await flush()) router.push(`/plan/${id}`);
    else setLeaving(false);
  }

  const codes = Object.fromEntries(catalog.map((c) => [c.id, c.code]));
  const inPlan = new Set(items.map((i) => i.catalog_id));
  const total = fullTotal(items);
  const essential = items.filter((i) => i.group === "essential").reduce((sum, i) => sum + i.price, 0);
  const { pet } = plan;
  const petDetails = [pet.species, pet.age_years != null && `${pet.age_years} yr${pet.age_years === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-6 pb-0 md:p-8 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Vet setup · Step 2 of 2</p>
          <h1 className="text-2xl font-bold">
            {pet.name} <span className="font-normal text-gray-500">({petDetails})</span>
          </h1>
          {pet.reason && <p className="text-lg">{pet.reason}</p>}
          <p className="text-gray-500">
            Owner: {plan.owner_name}
            {plan.budget != null && <> · Budget today: {money(plan.budget)}</>}
          </p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-sm text-gray-500">Full estimate</dt>
            <dd className="text-xl font-bold tabular-nums">{money(total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Essential now</dt>
            <dd
              className={`text-xl font-bold tabular-nums ${
                plan.budget == null ? "" : essential > plan.budget ? "text-red-600" : "text-green-700"
              }`}
            >
              {money(essential)}
            </dd>
          </div>
        </dl>
      </header>

      <p className="text-gray-500">
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
          className="h-11 rounded-lg border border-dashed border-gray-400 px-4 font-medium hover:bg-gray-50 hover:text-black"
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

      <footer className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-background px-6 py-4 md:-mx-8 md:px-8">
        <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <p className="sr-only" aria-live="polite">
            {notice}
          </p>
          {removed && (
            <span>
              Removed {removed.item.name}.{" "}
              <button onClick={undoRemove} className="font-semibold text-blue-700 underline">
                Undo
              </button>
            </span>
          )}
          <SaveStatusText status={status} error={error} onRetry={() => void flush()} />
        </div>
        <div className="flex items-center gap-3">
          {items.length === 0 && <span className="text-sm text-gray-500">Add at least one item.</span>}
          <button
            onClick={review}
            disabled={leaving || items.length === 0}
            className="rounded-lg bg-foreground px-5 py-3 font-medium text-background disabled:opacity-50"
          >
            {leaving ? "Saving…" : `Review with ${plan.owner_name} →`}
          </button>
        </div>
      </footer>
    </main>
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
  if (status === "saving") return <span className="text-gray-500">Saving…</span>;
  if (status === "saved") return <span className="text-gray-500">All changes saved</span>;

  const code = error instanceof ApiError ? error.status : null;
  if (code === 409) return <span className="text-red-600">This plan was already agreed, so changes can&apos;t be saved.</span>;
  if (code === 404)
    return <span className="text-red-600">This plan no longer exists on the server. Start a new plan.</span>;
  return (
    <span className="text-red-600">
      Couldn&apos;t save changes.{" "}
      <button onClick={onRetry} className="font-semibold underline">
        Retry
      </button>
    </span>
  );
}
