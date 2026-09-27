"use client";

// Take-home summary, opened by share link (owner, roommate, or parent).
// TODO: approve / chip-in for co-owners (`shares` table), print styles, react-pdf (stretch).

import { use, useEffect, useRef, useState } from "react";
import { AppHeader, PageIntro, PlanHeader, StatusPage } from "@/components/AppChrome";
import { Disclaimer } from "@/components/Disclaimer";
import { api } from "@/lib/api";
import { SPLIT_PAYMENTS, fullTotal, money, todayTotal } from "@/lib/plan-math";
import type { Group, Plan, PlanItem } from "@/lib/types";
import { GROUP_TONE, card, focusRing, sectionLabel } from "@/lib/ui";
import { PageSpinner } from "@/components/Spinner";

const BADGE = "Take-home plan";

// How long "Link copied" / "PDF downloaded" stay up before the buttons reset.
const FEEDBACK_MS = 2500;

// "2026-10-06" -> "Tue, Oct 6". Built from parts: new Date("2026-10-06") is UTC midnight,
// which is the previous evening (and day) in US time zones.
function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// The Clipboard API only exists on https and localhost, so a tablet opening the laptop at
// http://192.168.x.x has no navigator.clipboard: fall back to copying from a hidden textarea.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

// "Mochi" -> "Mochi-care-plan.pdf", without characters file systems reject.
const pdfFileName = (petName: string) =>
  `${petName.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "pet"}-care-plan.pdf`;

type Feedback = "idle" | "busy" | "done" | "failed";

// The shared secondary button, turning green on success. Separate class sets (rather than
// adding green on top) so there are no competing border/background utilities.
const feedbackButton = (done: boolean) =>
  `inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${focusRing} ${
    done ? "border-good/50 bg-optional-soft text-good" : "border-line bg-white text-ink hover:border-ink/30"
  }`;

export default function SummaryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copy, setCopy] = useState<Feedback>("idle");
  const [pdf, setPdf] = useState<Feedback>("idle");
  const resetTimers = useRef<{ copy?: number; pdf?: number }>({});

  // Don't reset state after leaving the page.
  useEffect(() => {
    const timers = resetTimers.current;
    return () => {
      window.clearTimeout(timers.copy);
      window.clearTimeout(timers.pdf);
    };
  }, []);

  // Show a result: success for a moment, then the normal button again; a failure stays until the next try.
  function flash(which: "copy" | "pdf", result: Feedback) {
    const set = which === "copy" ? setCopy : setPdf;
    set(result);
    window.clearTimeout(resetTimers.current[which]);
    if (result === "done") resetTimers.current[which] = window.setTimeout(() => set("idle"), FEEDBACK_MS);
  }

  async function copyLink() {
    flash("copy", (await copyText(window.location.href)) ? "done" : "failed");
  }

  async function downloadPdf(petName: string) {
    if (pdf === "busy") return;
    window.clearTimeout(resetTimers.current.pdf);
    setPdf("busy");
    try {
      const res = await fetch(api.sharedPdfUrl(token));
      if (!res.ok) throw new Error(`PDF request failed: ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName(petName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000); // after the browser has started the save
      flash("pdf", "done");
    } catch {
      flash("pdf", "failed");
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getSharedPlan(token)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadError)
    return (
      <StatusPage header={<AppHeader badge={BADGE} />}>
        <h1 className="text-2xl font-extrabold tracking-tight">Plan not found</h1>
        <p className="text-muted">
          This link may be wrong, or the plan was cleared when the server restarted. Ask the clinic to share it again.
        </p>
      </StatusPage>
    );

  if (!plan)
    return (
      <div className="flex-1 text-ink">
        <AppHeader badge={BADGE} />
        <PageSpinner />
      </div>
    );

  const doneToday = plan.items.filter((i) => i.selected);
  const recheck = plan.items.filter((i) => !i.selected && i.group === "soon");
  const nextVisit = plan.items.filter((i) => !i.selected && i.group !== "soon");
  const total = todayTotal(plan.items);
  const installment = total / SPLIT_PAYMENTS;

  return (
    <div className="flex-1 text-ink">
      <PlanHeader plan={plan} note="Sample estimate" badge={BADGE} />
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="space-y-6">
          <PageIntro
            eyebrow="Take-home plan"
            title={
              <>
                <span className="text-badger">{plan.pet.name}&apos;s</span> care plan
              </>
            }
            subtitle="What was done today and what comes next. Share it with a roommate or parent who helps."
          />
          <Section title="Done today" tone="essential" items={doneToday} />
          <Section title="Scheduled for a recheck" tone="soon" items={recheck} />
          <Section title="Revisit at next visit" tone="optional" items={nextVisit} />
        </div>

        <aside className={`${card} space-y-5 self-start p-5 md:sticky md:top-6`}>
          <div>
            <h2 className={sectionLabel}>Today&apos;s total</h2>
            <p className="font-serif text-5xl tabular-nums">{money(total)}</p>
            <p className="text-sm text-slate">Full estimate: {money(fullTotal(plan.items))}</p>
          </div>
          <p className="text-sm text-good">
            {plan.payment_choice === "split"
              ? `${SPLIT_PAYMENTS} payments of ${money(installment)}, ${money(installment)} due today.`
              : `${money(total)} due at checkout.`}
          </p>
          <hr className="border-line" />
          <div className="space-y-2">
            <button onClick={() => void copyLink()} className={feedbackButton(copy === "done")}>
              {copy === "done" ? (
                <>
                  <CheckIcon /> Link copied
                </>
              ) : (
                <>
                  <LinkIcon /> Copy link to share with a roommate or parent
                </>
              )}
            </button>
            <button
              onClick={() => void downloadPdf(plan.pet.name)}
              disabled={pdf === "busy"}
              className={`${feedbackButton(pdf === "done")} disabled:cursor-wait disabled:opacity-70`}
            >
              {pdf === "done" ? (
                <>
                  <CheckIcon /> PDF downloaded
                </>
              ) : (
                <>
                  <DownloadIcon /> {pdf === "busy" ? "Preparing PDF…" : "Download PDF"}
                </>
              )}
            </button>
            {/* Announced to screen readers; failures also stay visible here. */}
            <p aria-live="polite" className="min-h-5 text-sm text-bad">
              {copy === "failed" && "Couldn't copy the link. Copy it from your browser's address bar instead."}
              {pdf === "failed" && "Couldn't download the PDF. Check your connection and try again."}
              <span className="sr-only">
                {copy === "done" && "Link copied."}
                {pdf === "done" && "PDF downloaded."}
              </span>
            </p>
          </div>
          <Disclaimer />
        </aside>
      </main>
    </div>
  );
}

function Section({ title, tone, items }: { title: string; tone: Group; items: PlanItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      {/* Same header as the decision screen's group sections. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[tone]}`}>{title}</h2>
        <span className="ml-auto text-sm text-muted tabular-nums">{money(items.reduce((s, i) => s + i.price, 0))}</span>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-4 rounded-xl border border-line bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.name}</p>
              {i.recheck_date && <p className="text-sm text-slate">By {formatDate(i.recheck_date)}</p>}
            </div>
            <span className="shrink-0 text-lg font-semibold tabular-nums">{money(i.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-4 w-4 shrink-0",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function LinkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
