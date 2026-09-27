import Link from "next/link";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { MagneticCard, MagneticCards } from "@/components/MagneticCards";
import { GROUPS } from "@/lib/types";
import { GROUP_TONE, focusRing } from "@/lib/ui";

export default function Home() {
  return (
    <div className="relative isolate flex-1 text-ink">
      {/* Same Madison backdrop as the shared decision screen's intro. */}
      <div
        className="fixed inset-0 -z-10"
        style={{ background: "url(/backgrounds/madison.svg) center / cover no-repeat #f6f2ea" }}
        aria-hidden
      />
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className="max-w-3xl space-y-7 pt-2">
          <PageIntro
            eyebrow="Madison pet care"
            title={
              <>
                <span className="text-badger">Isthmus</span> Care
              </>
            }
            subtitle="Turn a confusing vet estimate into a clear plan you can afford: what's essential today, what can wait, and what's optional."
          />

          <MagneticCards className="grid gap-5 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <MagneticCard key={g.id} maxScale={1.04}>
                <div className="h-full rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_24px_60px_-24px_rgba(80,50,30,0.35)] backdrop-blur-md">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[g.id]}`}>{g.label}</span>
                  <p className="mt-3 text-sm text-slate">{g.hint}</p>
                </div>
              </MagneticCard>
            ))}
          </MagneticCards>

          <div className="flex flex-wrap gap-3">
            <Link href="/setup?new=1" className={`w-fit rounded-xl ${focusRing}`}>
              <ChromaticLabel className="shadow-lg shadow-badger/30">Start a visit plan (vet)</ChromaticLabel>
            </Link>
            <Link href="/setup?demo=1" className={`w-fit rounded-xl ${focusRing}`}>
              <ChromaticLabel texture="pine">Open the Mochi demo</ChromaticLabel>
            </Link>
          </div>
        </div>
      </main>

      <Link
        href="/clinic"
        className={`fixed right-4 bottom-4 rounded-full border border-line bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition-colors hover:border-ink/30 sm:right-6 sm:bottom-6 ${focusRing}`}
      >
        Clinic price list
      </Link>
    </div>
  );
}
