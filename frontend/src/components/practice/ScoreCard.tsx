import { money } from "@/lib/plan-math";
import { GROUPS, type CategoryScore, type GradedItem, type GradeResponse, type Group } from "@/lib/types";
import { GROUP_TONE, card, sectionLabel } from "@/lib/ui";

const label = (g: Group) => GROUPS.find((x) => x.id === g)!.label;

function verdict(i: GradedItem): { text: string; tone: string } {
  if (i.expected == null) return { text: "Not in the real case (−3)", tone: "bg-essential-soft text-essential" };
  if (i.expected === "optional")
    return { text: i.chosen ? "Included · not scored" : "Skipped · not scored", tone: "bg-cream text-muted" };
  if (i.chosen == null) return { text: "Missed", tone: "bg-essential-soft text-essential" };
  if (i.chosen === "test" || i.chosen === i.expected) return { text: "Got it", tone: "bg-optional-soft text-optional" };
  return { text: `Half credit · you chose ${label(i.chosen)}`, tone: "bg-soon-soft text-soon" };
}

function Coverage({ name, cat }: { name: string; cat: CategoryScore }) {
  const pct = Math.round(cat.coverage * 100);
  const met = cat.coverage >= cat.target;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-muted tabular-nums">
          {cat.total === 0 ? "None in this case" : `${cat.credit} of ${cat.total} · ${pct}%`}
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-cream">
        <div
          className={`h-full rounded-full ${met ? "bg-good" : "bg-study"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        <span
          className="absolute -top-1 h-4.5 w-0.5 bg-ink/60"
          style={{ left: `${cat.target * 100}%` }}
          title={`Full marks at ${Math.round(cat.target * 100)}%`}
          aria-hidden
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        Full marks at {Math.round(cat.target * 100)}%{met ? " · reached" : ""}
      </p>
    </div>
  );
}

export function ScoreCard({ result, petName }: { result: GradeResponse; petName: string }) {
  const tone = result.score >= 90 ? "text-good" : result.score >= 60 ? "text-soon" : "text-essential";
  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <section className={`${card} space-y-5 p-6`} aria-label="Score">
        <div>
          <h2 className={sectionLabel}>Your score</h2>
          <p className={`mt-1 text-7xl font-extrabold tracking-tight tabular-nums ${tone}`}>
            {result.score}
            <span className="text-3xl">%</span>
          </p>
        </div>
        <Coverage name="Essential now" cat={result.essential} />
        <Coverage name="Recommended soon" cat={result.soon} />
        <p className="text-sm text-slate">
          {result.penalty > 0
            ? `−${result.penalty} for items the real case didn't need (3 each, at most 15).`
            : "No unneeded items. Nice and lean."}
        </p>
        <div className="space-y-1 border-t border-line pt-4 text-sm">
          <p className="flex justify-between">
            <span>Your bill</span>
            <span className="font-semibold tabular-nums">{money(result.student_total)}</span>
          </p>
          <p className="flex justify-between text-muted">
            <span>Real case (without nice-to-haves)</span>
            <span className="tabular-nums">{money(result.case_total)}</span>
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <h3 className={sectionLabel}>What {petName} had</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.symptoms.map((s) => (
              <li key={s} className="rounded-full bg-study-soft px-2.5 py-0.5 text-xs font-medium text-study-deep">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${card} p-6`} aria-label="Your plan against the real case">
        <h2 className={sectionLabel}>Your plan vs. the real case</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">Real case</th>
                <th className="py-2 font-medium">You</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.items.map((i) => {
                const v = verdict(i);
                return (
                  <tr key={i.catalog_id}>
                    <td className="py-2 pr-2">
                      <p className="font-medium">{i.name}</p>
                      <p className="text-xs text-muted tabular-nums">{money(i.price)}</p>
                    </td>
                    <td className="py-2 pr-2">
                      {i.expected ? (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[i.expected]}`}>
                          {label(i.expected)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not used</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {i.chosen === "test" ? (
                        <span className="rounded-md bg-study-soft px-2 py-0.5 font-semibold text-study">Test run</span>
                      ) : i.chosen ? (
                        <span className={`rounded-md px-2 py-0.5 font-semibold ${GROUP_TONE[i.chosen]}`}>
                          {label(i.chosen)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${v.tone}`}>
                        {v.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
