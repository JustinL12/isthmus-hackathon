"use client";

import { useState } from "react";
import { searchCatalog, suggestedGroup } from "@/lib/catalog";
import { money } from "@/lib/plan-math";
import { GROUPS, type CatalogItem } from "@/lib/types";
import { GROUP_TONE, card, focusRing, input, secondaryButton, sectionLabel } from "@/lib/ui";

/** Search the clinic price list (name, code, or estimate shorthand like "CBC w/ diff") and add items. */
export function CatalogSearch({
  catalog,
  templateId,
  inPlan,
  onAdd,
  onClose,
}: {
  catalog: CatalogItem[];
  templateId: string | null;
  inPlan: Set<string>; // catalog ids already on the plan
  onAdd: (item: CatalogItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = searchCatalog(catalog, query);

  return (
    <section aria-label="Add items from the price list" className={`${card} p-4 text-ink`}>
      <h2 className={`mb-2 ${sectionLabel}`}>Add from the price list</h2>
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search price list"
          placeholder="Search by name, code, or estimate shorthand (e.g. CBC w/ diff)"
          className={`min-w-0 flex-1 ${input}`}
        />
        <button onClick={onClose} className={`h-11 ${secondaryButton}`}>
          Done
        </button>
      </div>

      <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto">
        {results.length === 0 && (
          <li className="py-3 text-sm text-muted">No matching items in the price list.</li>
        )}
        {results.map(({ item, alias }) => {
          const added = inPlan.has(item.id);
          const group = GROUPS.find((g) => g.id === suggestedGroup(item, templateId))!;
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.code}
                  {alias && <> · matches “{alias}”</>}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{money(item.price)}</span>
              <button
                onClick={() => onAdd(item)}
                disabled={added}
                aria-label={added ? `${item.name} is already in the plan` : `Add ${item.name} to ${group.label}`}
                className={`h-10 w-40 shrink-0 rounded-lg px-3 text-sm font-semibold transition-[filter] hover:brightness-95 disabled:bg-cream disabled:font-medium disabled:text-muted disabled:hover:brightness-100 ${focusRing} ${
                  added ? "" : GROUP_TONE[group.id]
                }`}
              >
                {added ? "In plan" : `+ ${group.label}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
