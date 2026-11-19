import Link from "next/link";
import type { ReactNode } from "react";
import { IsthmusCareLogo } from "@/components/IsthmusCareLogo";
import { describePet } from "@/lib/pet";
import type { Plan } from "@/lib/types";
import { card } from "@/lib/ui";

// Page chrome shared by every screen, matching the shared decision screen:
// the red top bar, the page intro (eyebrow + title + serif subtitle), and a
// simple layout for error / notice screens.

type Tone = "badger" | "study";
const TONE = {
  badger: { bar: "bg-badger", eyebrow: "text-badger", rule: "bg-badger", quote: "border-badger/40" },
  study: { bar: "bg-study", eyebrow: "text-study", rule: "bg-study", quote: "border-study/40" },
} as const;

/**
 * Badger-red top bar shared by every page: logo (links home), optional context
 * (e.g. the patient), and optional labels on the right.
 */
export function AppHeader({
  title,
  subtitle,
  note,
  badge,
  tone = "badger",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Small uppercase text on the right, e.g. "Sample estimate". Hidden below lg. */
  note?: string;
  /** Pill on the right, e.g. "Shared screen · vet + owner". Hidden below md. */
  badge?: string;
  /** "study" = the blue vet student practice pages. */
  tone?: Tone;
}) {
  return (
    <header className={`${TONE[tone].bar} text-white`}>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-serif text-2xl">
          {/* The link text names it; the badge is decoration here. */}
          <span aria-hidden className="flex">
            <IsthmusCareLogo size={32} variant="icon" />
          </span>
          Isthmus
        </Link>
        {title != null && (
          <>
            <div className="hidden h-9 w-px bg-white/30 sm:block" />
            <div className="min-w-0">
              <p className="truncate font-medium">{title}</p>
              {subtitle != null && <p className="truncate text-sm text-white/80">{subtitle}</p>}
            </div>
          </>
        )}
        {(note || badge) && (
          <div className="ml-auto hidden items-center gap-3 md:flex">
            {note && (
              <span className="hidden text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-white/80 lg:inline">
                {note}
              </span>
            )}
            {badge && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium whitespace-nowrap text-white ring-1 ring-white/30">
                {badge}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** AppHeader with the patient and owner of a plan as context. */
export function PlanHeader({ plan, note, badge }: { plan: Plan; note?: string; badge?: string }) {
  const { pet } = plan;
  return (
    <AppHeader
      title={
        <>
          {pet.name} · {describePet(pet)}
        </>
      }
      subtitle={[pet.reason, `Owner: ${plan.owner_name}`].filter(Boolean).join(" · ")}
      note={note}
      badge={badge}
    />
  );
}

/** A header plus one white card: for "not found", "couldn't load" and similar screens. */
export function StatusPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 text-ink">
      {header}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className={`${card} max-w-xl space-y-3 p-6`}>{children}</div>
      </main>
    </div>
  );
}

/** Eyebrow, big title and serif subtitle, as at the top of the decision screen. */
export function PageIntro({
  eyebrow,
  title,
  subtitle,
  tone = "badger",
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="space-y-3">
      <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${TONE[tone].eyebrow}`}>
        <span className={`h-px w-6 ${TONE[tone].rule}`} aria-hidden />
        {eyebrow}
      </p>
      <h1 className="text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] md:text-5xl">{title}</h1>
      {subtitle != null && (
        <p className={`border-l-2 ${TONE[tone].quote} pl-3 font-serif text-lg leading-snug text-slate italic md:text-xl`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
