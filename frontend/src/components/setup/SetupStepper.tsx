"use client";

import { focusRing } from "@/lib/ui";

export const SETUP_STEPS = ["Patient", "Visit template", "Sort items"] as const;

export interface StepNav {
  /** Where the arrow goes, e.g. "Next: Visit template". Used as its accessible name and tooltip. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Vet setup progress (Patient → Visit template → Sort items) between a back arrow and a
 * forward arrow. Leave `back`/`forward` out where there's no step to go to; the arrow stays
 * in place but disabled so the bar doesn't shift between steps.
 */
export function SetupStepper({ step, back, forward }: { step: 1 | 2 | 3; back?: StepNav; forward?: StepNav }) {
  return (
    <nav aria-label="Vet setup steps" className="flex items-center gap-2 sm:gap-4">
      <ArrowButton direction="back" nav={back} />
      <ol className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        {SETUP_STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              // Sized by content (then the connectors stretch), so the current step's name fits.
              className={`flex min-w-0 items-center gap-2 ${n < SETUP_STEPS.length ? "flex-auto" : ""}`}
            >
              <span
                aria-hidden
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  state === "done"
                    ? "bg-primary text-white"
                    : state === "current"
                      ? "bg-badger text-white"
                      : "border border-line bg-white text-muted"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              {/* On phones only the current step's name fits. */}
              <span
                className={`truncate text-sm font-medium ${state === "current" ? "text-ink" : "hidden text-muted sm:inline"}`}
              >
                <span className="sr-only">Step {n}: </span>
                {label}
                {state === "done" && <span className="sr-only"> (done)</span>}
              </span>
              {n < SETUP_STEPS.length && (
                <span aria-hidden className={`h-0.5 min-w-3 flex-1 rounded-full ${n < step ? "bg-primary" : "bg-line"}`} />
              )}
            </li>
          );
        })}
      </ol>
      <ArrowButton direction="forward" nav={forward} />
    </nav>
  );
}

function ArrowButton({ direction, nav }: { direction: "back" | "forward"; nav?: StepNav }) {
  const back = direction === "back";
  const label = nav?.label ?? (back ? "No previous step" : "No next step");
  return (
    <button
      type="button"
      onClick={nav?.onClick}
      disabled={!nav || nav.disabled}
      aria-label={label}
      title={label}
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition ${focusRing} disabled:cursor-not-allowed disabled:opacity-40 ${
        back
          ? "border border-line bg-white text-ink enabled:hover:border-ink/30"
          : "bg-badger text-white shadow-lg shadow-badger/30 enabled:hover:brightness-110"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={back ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} />
      </svg>
    </button>
  );
}
