"use client";

import { money } from "@/lib/plan-math";
import type { CatalogItem } from "@/lib/types";
import { card, focusRing, sectionLabel } from "@/lib/ui";

/** Diagnostics the student can run. Each one costs its price and goes on the bill's "Tests run". */
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
  return (
    <section aria-label="Run a test" className={`${card} p-4`}>
      <h2 className={sectionLabel}>Run a test</h2>
      <p className="mt-1 text-xs text-muted">Each test is added to the bill. Only run what you need.</p>
      <ul className="mt-2 divide-y divide-line">
        {tests.map((t) => {
          const done = ran.has(t.id);
          return (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{t.name}</p>
                <p className="text-xs text-muted tabular-nums">{money(t.price)}</p>
              </div>
              {done ? (
                <span className="shrink-0 rounded-md bg-study-soft px-2 py-0.5 text-xs font-semibold text-study">Done</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRun(t)}
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
    </section>
  );
}
