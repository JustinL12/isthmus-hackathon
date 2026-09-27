"use client";

import { useEffect, useState } from "react";
import { SPECIES, type Species, type SpeciesInfo, searchSpecies, speciesLabel } from "@/lib/species";
import { inputBase } from "@/lib/ui";

const OTHER = SPECIES.filter((s) => s.id === "other");

/**
 * Species picker for the patient step: a search box with a dropdown list (an ARIA combobox).
 * Type to filter ("bunny" finds rabbit, "bird" the birds); ↑/↓ and Enter pick, Esc cancels.
 * Leaving the box without picking keeps the current species, so the value is always valid.
 */
export function SpeciesSearch({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Species;
  onChange: (species: Species) => void;
}) {
  // null while not editing: the box shows the chosen species. Otherwise it's what's typed.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const open = query !== null;
  const hits = open ? searchSpecies(query) : [];
  const results: readonly SpeciesInfo[] = hits.length ? hits : OTHER; // nothing matched: offer "Other animal"
  const listId = `${id}-list`;
  const optionId = (s: SpeciesInfo) => `${id}-option-${s.id}`;

  // Keep the highlighted option in view while moving through a long list.
  const activeOptionId = open && results[active] ? optionId(results[active]) : undefined;
  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  function start() {
    setQuery("");
    setActive(Math.max(0, SPECIES.findIndex((s) => s.id === value)));
  }

  function choose(s: SpeciesInfo) {
    setQuery(null);
    if (s.id !== value) onChange(s.id);
  }

  function leave() {
    if (query === null) return;
    // Typed an exact name and left without picking: take it; anything else keeps the current species.
    const typed = query.trim().toLowerCase();
    const exact = SPECIES.find((s) => [speciesLabel(s.id), s.noun, s.plural].some((n) => n.toLowerCase() === typed));
    if (typed && exact) choose(exact);
    else setQuery(null);
  }

  return (
    <div className="relative mt-1">
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        value={open ? query : speciesLabel(value)}
        placeholder={speciesLabel(value)}
        onFocus={start}
        onClick={() => !open && start()}
        onBlur={leave}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) start();
            else setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (open) setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault(); // pick, don't submit the form
            if (results[active]) choose(results[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setQuery(null);
          }
        }}
        className={`pr-3 pl-9 ${inputBase}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Species"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-white py-1 text-ink shadow-lg"
        >
          {!hits.length && (
            <li role="presentation" className="px-3 py-2 text-sm text-muted">
              No species matches &ldquo;{query.trim()}&rdquo;.
            </li>
          )}
          {results.flatMap((s, i) => {
            const selected = s.id === value;
            // A group heading ("Birds") before the first species of each group.
            const heading =
              i === 0 || results[i - 1].group !== s.group
                ? [
                    <li
                      key={`heading-${i}`} // a group can recur after search reordering
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase"
                    >
                      {s.group}
                    </li>,
                  ]
                : [];
            return [
              ...heading,
              <li
                key={s.id}
                id={optionId(s)}
                role="option"
                aria-selected={selected}
                // mousedown, not click: picking must happen before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                  i === active ? "bg-cream" : ""
                }`}
              >
                {speciesLabel(s.id)}
                {selected && (
                  <span aria-hidden className="font-semibold text-primary">
                    ✓
                  </span>
                )}
              </li>,
            ];
          })}
        </ul>
      )}
    </div>
  );
}
