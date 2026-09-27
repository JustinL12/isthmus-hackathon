"use client";

// Clinic price list: search the procedures, change prices, names, codes and the explanations
// owners see, add new procedures, and remove or restore them. Changes apply to new plans
// right away; plans already built keep their prices.
// TODO: protect with a clinic PIN (the write endpoints are open; see backend/app/routers/catalog.py).

import { useEffect, useMemo, useState } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { PriceEditor } from "@/components/clinic/PriceEditor";
import { PageSpinner } from "@/components/Spinner";
import { api } from "@/lib/api";
import { searchCatalog } from "@/lib/catalog";
import type { CatalogItem, CatalogItemDetail, Explanation } from "@/lib/types";
import { card, ctaWrapper, focusRing, input, secondaryButton, segmentOption, segmentTrack } from "@/lib/ui";

type View = "active" | "removed";
const NEW = "new";

const priceText = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function ClinicPriceList() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Explanation>>({});
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");
  const [missingOnly, setMissingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // item id, NEW, or nothing open
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.catalog(true), api.explanations()])
      .then(([cs, es]) => {
        if (cancelled) return;
        setItems(cs);
        setExplanations(es);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const byName = useMemo(() => [...(items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const active = byName.filter((i) => i.active);
  const removed = byName.filter((i) => !i.active);
  const missing = active.filter((i) => !explanations[i.id]);
  const inView = view === "active" ? (missingOnly ? missing : active) : removed;
  const shown = query.trim() ? searchCatalog(inView, query).map((m) => m.item) : inView;
  const current = selected && selected !== NEW ? (byName.find((i) => i.id === selected) ?? null) : null;

  function saved(item: CatalogItemDetail, message: string) {
    const { explanation, ...rest } = item;
    setItems((list) => {
      const others = (list ?? []).filter((i) => i.id !== item.id);
      return [...others, rest];
    });
    if (explanation) setExplanations((e) => ({ ...e, [item.id]: explanation }));
    setNotice(message);
    // Follow the item to the tab it now belongs on, and keep it open unless it just left this view.
    setView(item.active ? "active" : "removed");
    setSelected(item.id);
  }

  function open(id: string) {
    setNotice("");
    setSelected(id);
  }

  const editor = selected ? (
    <PriceEditor
      key={selected === NEW ? NEW : `${selected}:${current?.active}`}
      item={current}
      explanation={current ? (explanations[current.id] ?? null) : null}
      onSaved={saved}
      onCancel={() => setSelected(null)}
    />
  ) : (
    <div className={`${card} space-y-3 p-5 text-sm text-slate sm:p-6`}>
      <p className="font-semibold text-ink">Pick a procedure to edit it</p>
      <p>Change its price, name, billing code or the explanation owners see, or remove it from the list.</p>
      <p>New prices apply to plans built from now on. Plans already built keep the price they were made with.</p>
    </div>
  );

  return (
    <div className="flex-1 text-ink">
      <AppHeader title="Clinic price list" subtitle="Procedures, prices and owner explanations" badge="Clinic" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageIntro
            eyebrow="Clinic settings"
            title={
              <>
                Your <span className="text-badger">price list</span>
              </>
            }
            subtitle="What vets can add to a plan, what it costs, and how it's explained to owners."
          />
          <button onClick={() => open(NEW)} className={`w-full sm:w-auto ${ctaWrapper}`}>
            <ChromaticLabel className="px-6 py-3 shadow-lg shadow-badger/30">+ Add a procedure</ChromaticLabel>
          </button>
        </div>

        {loadError ? (
          <div className={`${card} mt-8 max-w-xl space-y-3 p-6`}>
            <p className="font-semibold">Couldn&apos;t load the price list</p>
            <p className="text-sm text-muted">Check that the Isthmus Care server is running, then try again.</p>
            <button
              onClick={() => {
                setLoadError(false);
                setAttempt((n) => n + 1);
              }}
              className={secondaryButton}
            >
              Try again
            </button>
          </div>
        ) : items == null ? (
          <PageSpinner label="Loading the price list" />
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            {/* On small screens the editor comes first, so it's visible after tapping an item. */}
            <aside className="lg:sticky lg:top-6 lg:order-2">{editor}</aside>

            <section aria-label="Procedures" className="min-w-0 space-y-4 lg:order-1">
              <div className="flex flex-wrap items-center gap-3">
                <div role="tablist" aria-label="Which procedures" className={`grid-cols-2 ${segmentTrack}`}>
                  {(
                    [
                      ["active", `On the list (${active.length})`],
                      ["removed", `Removed (${removed.length})`],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`${segmentOption(view === v)} ${focusRing}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view === "active" && missing.length > 0 && (
                  <button
                    onClick={() => setMissingOnly((m) => !m)}
                    aria-pressed={missingOnly}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${focusRing} ${
                      missingOnly ? "bg-soon text-white" : "bg-soon-soft text-soon hover:brightness-95"
                    }`}
                  >
                    {missing.length} without an owner explanation
                  </button>
                )}
              </div>

              <label className="block">
                <span className="sr-only">Search procedures</span>
                <input
                  type="search"
                  className={input}
                  placeholder="Search by name or code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>

              {notice && (
                <p role="status" className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
                  ✓ {notice}
                </p>
              )}

              <div className={`${card} overflow-hidden`}>
                {shown.length === 0 ? (
                  <p className="p-6 text-sm text-muted">
                    {query.trim()
                      ? `Nothing matches “${query.trim()}”.`
                      : view === "removed"
                        ? "Nothing removed. Procedures you remove show up here so you can restore them."
                        : "No procedures yet. Add the first one."}
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {shown.map((item) => {
                      const isOpen = selected === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => open(item.id)}
                            aria-current={isOpen || undefined}
                            className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors sm:px-5 ${focusRing} ${
                              isOpen ? "bg-primary-soft/60" : "hover:bg-cream/70"
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate font-semibold ${item.active ? "" : "text-muted line-through"}`}>
                                {item.name}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                                {item.code && <span className="font-mono">{item.code}</span>}
                                {item.active && !explanations[item.id] && (
                                  <span className="rounded-full bg-soon-soft px-2 py-0.5 font-medium text-soon">
                                    No owner explanation
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 font-serif text-2xl tabular-nums">{priceText(item.price)}</span>
                            <span aria-hidden className="text-muted">
                              ›
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
