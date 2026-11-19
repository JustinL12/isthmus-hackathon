"use client";

import { useState } from "react";
import { searchTests } from "@/lib/catalog";
import { money } from "@/lib/plan-math";
import type { CatalogItem } from "@/lib/types";
import { card, focusRing, inputBase, sectionLabel } from "@/lib/ui";

/**
 * Search for a diagnostic to run. There's no list to browse on purpose: the student has to
 * think of the test first. Each test run costs its price and goes on the bill's "Tests run".
 */
export function TestPicker({
  tests,
  ran,
  running,
  disabled,
  onRun,
}: {
  tests: CatalogItem[];
  ran: Set<string>;
  running: string | null; // catalog id in flight
  disabled?: boolean;
  onRun: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = query.trim().length >= 2 ? searchTests(tests, query).slice(0, 6) : [];

  return (
    <section aria-label="Run a test" className={`${card} p-4`}>
      <h2 className={sectionLabel}>Run a test</h2>
      <p className="mt-1 text-xs text-muted">Each test is added to the bill. Only run what you need.</p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search for a test"
        placeholder="Which test? e.g. urinalysis, CBC…"
        className={`mt-2 ${inputBase} px-3 focus:border-study focus:ring-study/20`}
      />
      {query.trim().length >= 2 && (
        <ul className="mt-1 divide-y divide-line">
          {results.length === 0 && <li className="py-2 text-sm text-muted">No test by that name.</li>}
          {results.map(({ item: t, alias }) => {
            const done = ran.has(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{t.name}</p>
                  <p className="text-xs text-muted">
                    <span className="tabular-nums">{money(t.price)}</span>
                    {alias && <> · matches “{alias}”</>}
                  </p>
                </div>
                {done ? (
                  <span className="shrink-0 rounded-md bg-study-soft px-2 py-0.5 text-xs font-semibold text-study">
                    Done
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onRun(tests.find((x) => x.id === t.id) ?? t);
                      setQuery("");
                    }}
                    disabled={disabled || running != null}
                    className={`shrink-0 rounded-lg border border-study/30 px-3 py-1.5 text-xs font-semibold text-study transition-colors hover:bg-study-soft disabled:opacity-50 ${focusRing}`}
                  >
                    {running === t.id ? "Running…" : "Run"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {running && <p className="mt-2 text-xs text-study">Running test…</p>}
    </section>
  );
}
