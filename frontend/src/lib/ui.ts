// Shared class names for the Isthmus look, taken from the shared decision screen
// (app/plan/[id]/page.tsx) so every page draws cards, labels and controls the same way.

import type { Group } from "./types";

/** Tag colors for the three groups ("Essential now" pill etc.). */
export const GROUP_TONE: Record<Group, string> = {
  essential: "bg-essential-soft text-essential",
  soon: "bg-soon-soft text-soon",
  optional: "bg-optional-soft text-optional",
};

/** White panel on the cream page (the decision screen's "Today's plan" aside). */
export const card = "rounded-2xl border border-line bg-white";

/** Small uppercase section label ("TODAY'S PLAN", "TAKE-HOME SUMMARY"). */
export const sectionLabel = "text-xs font-semibold uppercase tracking-wider text-muted";

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Wrap a <ChromaticLabel> in a button or link with this (the decision screen's CTA). */
export const ctaWrapper = `block rounded-xl ${focusRing} disabled:cursor-not-allowed disabled:opacity-50`;

/** Plain white button for secondary actions. */
export const secondaryButton = `inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30 ${focusRing}`;

/** Quiet text link ("Can't cover it today? …"). */
export const quietLink = "text-sm text-muted underline-offset-2 hover:text-ink hover:underline";

export const fieldLabel = "block text-sm font-medium text-ink";

/** Text/number input and select, without horizontal padding (for inputs with a prefix). */
export const inputBase =
  "h-11 w-full rounded-xl border border-line bg-white text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20";
export const input = `${inputBase} px-3`;

/** Segmented control track and options (the payment toggle). */
export const segmentTrack = "grid gap-1 rounded-xl bg-cream p-1";
export const segmentOption = (on: boolean) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    on ? "bg-white text-ink shadow-sm" : "text-ink/70 hover:text-ink"
  }`;
