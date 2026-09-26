"use client";

import { useState } from "react";
import { searchCatalog, suggestedGroup } from "@/lib/catalog";
import { money } from "@/lib/plan-math";
import { GROUPS, type CatalogItem } from "@/lib/types";

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
    <section aria-label="Add items from the price list" className="rounded-xl border border-gray-200 bg-white p-4 text-black">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search price list"
          placeholder="Search by name, code, or estimate shorthand (e.g. CBC w/ diff)"
          className="h-11 flex-1 rounded-lg border border-gray-300 bg-white px-3"
        />
        <button onClick={onClose} className="h-11 rounded-lg px-4 font-medium text-gray-600 hover:bg-gray-100">
          Done
        </button>
      </div>

      <ul className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto">
        {results.length === 0 && (
          <li className="py-3 text-sm text-gray-500">No matching items in the price list.</li>
        )}
        {results.map(({ item, alias }) => {
          const added = inPlan.has(item.id);
          const group = GROUPS.find((g) => g.id === suggestedGroup(item, templateId))!;
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.code}
                  {alias && <> · matches “{alias}”</>}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{money(item.price)}</span>
              <button
                onClick={() => onAdd(item)}
                disabled={added}
                aria-label={added ? `${item.name} is already in the plan` : `Add ${item.name} to ${group.label}`}
                className="h-10 w-40 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50 disabled:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
