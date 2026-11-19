"use client";

import { money, testsTotal } from "@/lib/plan-math";
import type { TestRun } from "@/lib/types";
import { card, focusRing, sectionLabel } from "@/lib/ui";

/**
 * The top of the bill: tests already run this visit. They're done, so there's nothing to tick:
 * they're always billed today, apart from the treatment plan's groups. With `onResultChange`
 * the vet can edit each result (saved when the field loses focus).
 */
export function TestsRunSection({
  tests,
  title = "Tests run today",
  note = "Already done, so they're billed today, separate from the treatment plan.",
  onResultChange,
}: {
  tests: TestRun[];
  title?: string;
  note?: string;
  onResultChange?: (testId: string, result: string | null) => void;
}) {
  if (tests.length === 0) return null;
  return (
    <section aria-label={title} className={`${card} p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={sectionLabel}>{title}</h2>
        <span className="font-semibold tabular-nums">{money(testsTotal(tests))}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{note}</p>
      <ul className="mt-3 space-y-2">
        {tests.map((t) => (
          <li key={t.id} className="rounded-xl bg-primary-soft/50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 font-semibold">
                <span aria-hidden className="mr-1.5 text-primary">
                  ✓
                </span>
                {t.name}
              </p>
              <span className="shrink-0 text-sm text-slate tabular-nums">{money(t.price)}</span>
            </div>
            {onResultChange ? (
              <label className="mt-2 block text-xs font-medium text-muted">
                Results
                <textarea
                  rows={2}
                  defaultValue={t.result ?? ""}
                  maxLength={2000}
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== (t.result ?? null)) onResultChange(t.id, next);
                  }}
                  placeholder="What did the test show?"
                  className={`mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20 ${focusRing}`}
                />
              </label>
            ) : (
              <p className="mt-1 text-sm whitespace-pre-line text-slate">
                {t.result ? (
                  <>
                    <span className="font-medium text-ink">Result: </span>
                    {t.result}
                  </>
                ) : (
                  <span className="text-muted">Results to follow</span>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
