import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { MagneticCard, MagneticCards } from "@/components/MagneticCards";
import { focusRing } from "@/lib/ui";

// The vet team's start page: begin a new visit, or reopen a previous one.
export default function Home() {
  return (
    <div className="relative isolate flex-1 text-ink">
      {/* Same Madison backdrop as the shared decision screen's intro. */}
      <div
        className="fixed inset-0 -z-10"
        style={{ background: "url(/backgrounds/madison.svg) center / cover no-repeat #f6f2ea" }}
        aria-hidden
      />
      <AppHeader badge="Vet team" />

      {/* Bottom padding so the last card can scroll clear of the corner demo button. */}
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-20 sm:px-8">
        <div className="max-w-4xl space-y-8 pt-2">
          <PageIntro
            eyebrow="For the vet team"
            title={
              <>
                <span className="text-badger">Isthmus</span> Care
              </>
            }
            subtitle="Build a clear, affordable care plan with each owner. Start a new visit, or pick up a previous one."
          />

          <MagneticCards className="grid gap-5 sm:grid-cols-2">
            <MagneticCard maxScale={1.03}>
              <ActionCard
                href="/setup?new=1"
                icon={<PlusIcon />}
                accent="badger"
                title="Start a new visit"
                cta="New visit"
              >
                Enter the patient and owner, note the symptoms, and pick a starting plan. Then sort the estimate before
                reviewing it with the owner.
              </ActionCard>
            </MagneticCard>
            <MagneticCard maxScale={1.03}>
              <ActionCard
                href="/visits"
                icon={<ClockIcon />}
                accent="primary"
                title="View previous visits"
                cta="See visits"
              >
                Reopen a plan that&apos;s still in progress, or pull up the take-home summary of a visit the owner
                agreed to.
              </ActionCard>
            </MagneticCard>
          </MagneticCards>
        </div>
      </main>

      {/* Small, out of the way: the demo is for showing the app, not for daily use. */}
      <Link
        href="/setup?demo=1"
        aria-label="Open the Mochi demo"
        className={`fixed right-4 bottom-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105 motion-reduce:transition-none ${focusRing}`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13l10.5-6.5z" />
        </svg>
        Mochi demo
      </Link>
    </div>
  );
}

const ACCENT = {
  badger: { icon: "bg-badger/10 text-badger", cta: "bg-badger shadow-badger/30" },
  primary: { icon: "bg-primary-soft text-primary", cta: "bg-primary shadow-primary/30" },
} as const;

/** A whole-card link: icon, title, what it's for, and a button-style label. */
function ActionCard({
  href,
  icon,
  accent,
  title,
  cta,
  children,
}: {
  href: string;
  icon: ReactNode;
  accent: keyof typeof ACCENT;
  title: string;
  cta: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-2xl border border-white/70 bg-white/85 p-6 shadow-[0_24px_60px_-24px_rgba(80,50,30,0.35)] backdrop-blur-md transition-colors hover:bg-white sm:p-7 ${focusRing}`}
    >
      <span className={`grid h-12 w-12 place-items-center rounded-full [&>svg]:h-6 [&>svg]:w-6 ${ACCENT[accent].icon}`}>
        {icon}
      </span>
      <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 flex-1 text-slate">{children}</p>
      <span
        className={`mt-6 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white shadow-lg ${ACCENT[accent].cta}`}
      >
        {cta}
        <span aria-hidden className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none">
          →
        </span>
      </span>
    </Link>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
