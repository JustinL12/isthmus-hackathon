"use client";

import { useState } from "react";
import { searchCatalog } from "@/lib/catalog";
import { money } from "@/lib/plan-math";
import { GROUPS, type CatalogItem, type Group, type PracticeItem } from "@/lib/types";
import { GROUP_TONE, card, focusRing, inputBase, sectionLabel, segmentOption, segmentTrack } from "@/lib/ui";

/**
 * The student's bill: the tests already run (fixed, they've been done) and the treatment plan
 * in three groups, with a price-list search to add to the plan.
 */
export function PracticeBill({
  catalog,
  tests,
  plan,
  onAdd,
  onMove,
  onRemove,
}: {
  catalog: Map<string, CatalogItem>;
  tests: string[];
  plan: PracticeItem[];
  onAdd: (catalogId: string, group: Group) => void;
  onMove: (catalogId: string, group: Group) => void;
  onRemove: (catalogId: string) => void;
}) {
  const [group, setGroup] = useState<Group>("essential");
  const [query, setQuery] = useState("");
  const onBill = new Set([...tests, ...plan.map((p) => p.catalog_id)]);
  const results = query.trim() ? searchCatalog([...catalog.values()], query).slice(0, 8) : [];
  const price = (id: string) => catalog.get(id)?.price ?? 0;
  const testTotal = tests.reduce((s, id) => s + price(id), 0);
  const planTotal = plan.reduce((s, p) => s + price(p.catalog_id), 0);

  return (
    <section aria-label="Bill" className={`${card} p-4`}>
      <h2 className={sectionLabel}>Bill</h2>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-study">Tests run</h3>
          <span className="text-xs text-muted tabular-nums">{money(testTotal)}</span>
        </div>
        {tests.length === 0 ? (
          <p className="mt-1 text-xs text-muted">No tests run yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {tests.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-study-soft/50 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 truncate">{catalog.get(id)?.name ?? id}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{money(price(id))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {GROUPS.map((g) => {
        const items = plan.filter((p) => p.group === g.id);
        return (
          <div key={g.id} className="mt-4">
            <h3 className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[g.id]}`}>{g.label}</span>
            </h3>
            {items.length === 0 ? (
              <p className="mt-1 text-xs text-muted">Nothing here yet.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {items.map((p) => {
                  const item = catalog.get(p.catalog_id);
                  return (
                    <li key={p.catalog_id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item?.name ?? p.catalog_id}</p>
                        <p className="text-xs text-muted tabular-nums">{money(price(p.catalog_id))}</p>
                      </div>
                      <select
                        value={p.group}
                        onChange={(e) => onMove(p.catalog_id, e.target.value as Group)}
                        aria-label={`Move ${item?.name ?? p.catalog_id}`}
                        className={`h-8 rounded-lg border border-line bg-white px-1.5 text-xs ${focusRing}`}
                      >
                        {GROUPS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onRemove(p.catalog_id)}
                        aria-label={`Remove ${item?.name ?? p.catalog_id}`}
                        className={`grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-cream hover:text-ink ${focusRing}`}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-lg font-extrabold tabular-nums">{money(testTotal + planTotal)}</span>
      </div>

      <div className="mt-4 rounded-xl bg-cream/60 p-3">
        <h3 className="text-sm font-semibold">Add to the plan</h3>
        <div className={`mt-2 grid-cols-3 ${segmentTrack}`} role="radiogroup" aria-label="Group to add to">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={group === g.id}
              onClick={() => setGroup(g.id)}
              className={`${segmentOption(group === g.id)} px-1 text-xs ${focusRing}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the price list"
          placeholder="Search treatments, meds, vaccines…"
          className={`mt-2 ${inputBase} px-3 focus:border-study focus:ring-study/20`}
        />
        {query.trim() && (
          <ul className="mt-1 max-h-64 divide-y divide-line overflow-y-auto">
            {results.length === 0 && <li className="py-2 text-sm text-muted">No matching items.</li>}
            {results.map(({ item }) => (
              <li key={item.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight">{item.name}</p>
                  <p className="text-xs text-muted tabular-nums">{money(item.price)}</p>
                </div>
                {onBill.has(item.id) ? (
                  <span className="text-xs text-muted">{tests.includes(item.id) ? "Test run" : "On plan"}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(item.id, group)}
                    aria-label={`Add ${item.name}`}
                    className={`grid h-8 w-8 place-items-center rounded-lg font-semibold ${GROUP_TONE[group]} ${focusRing}`}
                  >
                    <span aria-hidden>+</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
