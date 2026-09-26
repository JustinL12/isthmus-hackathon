"use client";

import { useState } from "react";
import { searchCatalog } from "@/lib/catalog";
import { money } from "@/lib/plan-math";
import { GROUPS, type CatalogItem, type Group } from "@/lib/types";
import { GROUP_TONE, card, focusRing, input, sectionLabel } from "@/lib/ui";

/**
 * Price-list sidebar: search the clinic price list (name, code, or estimate shorthand like
 * "CBC w/ diff") and add items to `group`, the group currently open on the board.
 */
export function CatalogSearch({
  catalog,
  group,
  inPlan,
  onAdd,
}: {
  catalog: CatalogItem[];
  group: Group;
  inPlan: Set<string>; // catalog ids already on the plan
  onAdd: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = searchCatalog(catalog, query);
  const label = GROUPS.find((g) => g.id === group)!.label;

  return (
    <section aria-label="Add items from the price list" className={`${card} flex flex-col p-4 text-ink`}>
      <h2 className={sectionLabel}>Add from the price list</h2>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate">
        Adds to
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[group]}`}>{label}</span>
      </p>
      <p className="mt-1 text-xs text-muted">Open another group on the board to add there.</p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search price list"
        placeholder="Name, code, or shorthand"
        className={`mt-3 ${input}`}
      />

      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto lg:max-h-[60vh]">
        {results.length === 0 && <li className="py-3 text-sm text-muted">No matching items in the price list.</li>}
        {results.map(({ item, alias }) => {
          const added = inPlan.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{item.name}</p>
                <p className="text-xs text-muted">
                  <span className="font-medium text-slate tabular-nums">{money(item.price)}</span> · {item.code}
                  {alias && <> · matches “{alias}”</>}
                </p>
              </div>
              {added ? (
                <span className="shrink-0 text-xs text-muted">In plan</span>
              ) : (
                <button
                  onClick={() => onAdd(item)}
                  aria-label={`Add ${item.name} to ${label}`}
                  title={`Add to ${label}`}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-semibold transition-[filter] hover:brightness-95 ${focusRing} ${GROUP_TONE[group]}`}
                >
                  <span aria-hidden>+</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
