"use client";

import { useState } from "react";
import type { Symptom } from "@/lib/types";
import { card, focusRing, input, sectionLabel } from "@/lib/ui";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Search the symptom list and add symptoms; anything not on the list can be added as a new symptom. */
export function SymptomSearch({
  symptoms,
  chosen,
  onAdd,
  onCreate,
}: {
  symptoms: Symptom[]; // the list for this species
  chosen: Set<string>; // symptom ids already added
  onAdd: (symptom: Symptom) => void;
  /** Adds `label` to the clinic's symptom list; resolves once it's saved. */
  onCreate: (label: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  const words = norm(query).split(" ").filter(Boolean);
  const results = symptoms.filter((s) => words.every((w) => norm(s.label).includes(w) || s.id.includes(w)));
  const exact = symptoms.some((s) => norm(s.label) === norm(query));
  const newLabel = query.trim().replace(/\s+/g, " ");

  async function create() {
    if (!newLabel || creating) return;
    setCreating(true);
    setCreateError(false);
    try {
      await onCreate(newLabel);
      setQuery("");
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section aria-label="Add symptoms" className={`${card} p-4 text-ink`}>
      <h2 className={`mb-2 ${sectionLabel}`}>Add a symptom</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // Enter adds the only match, or the typed text as a new symptom.
          const only = results.length === 1 && !chosen.has(results[0].id) ? results[0] : null;
          if (only) {
            onAdd(only);
            setQuery("");
          } else if (!exact && results.length === 0) void create();
        }}
        autoFocus
        aria-label="Search symptoms"
        placeholder="Search symptoms, or type a new one (e.g. pale gums)"
        className={input}
      />

      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
        {newLabel && !exact && (
          <li className="flex items-center gap-3 py-2">
            <p className="min-w-0 flex-1 text-sm">
              Not on the list? Add <span className="font-semibold">&ldquo;{newLabel}&rdquo;</span> as a new symptom.
              {createError && <span className="block text-bad">Couldn&apos;t save it. Try again.</span>}
            </p>
            <button
              onClick={() => void create()}
              disabled={creating}
              className={`h-10 w-36 shrink-0 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary transition-[filter] hover:brightness-95 disabled:opacity-60 ${focusRing}`}
            >
              {creating ? "Adding…" : "+ New symptom"}
            </button>
          </li>
        )}
        {results.length === 0 && !newLabel && <li className="py-3 text-sm text-muted">No symptoms on the list yet.</li>}
        {results.map((s) => {
          const added = chosen.has(s.id);
          return (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <p className="min-w-0 flex-1 font-semibold leading-tight">{s.label}</p>
              <button
                onClick={() => onAdd(s)}
                disabled={added}
                aria-label={added ? `${s.label} is already added` : `Add ${s.label}`}
                className={`h-10 w-36 shrink-0 rounded-lg px-3 text-sm font-semibold transition-[filter] hover:brightness-95 disabled:bg-cream disabled:font-medium disabled:text-muted disabled:hover:brightness-100 ${focusRing} ${
                  added ? "" : "bg-primary-soft text-primary"
                }`}
              >
                {added ? "Added" : "+ Add"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
