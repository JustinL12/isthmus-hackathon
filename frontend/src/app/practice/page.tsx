"use client";

// Vet student practice: a stored case becomes a game. The student starts with the basics, asks the
// owner questions, runs tests (each goes on the bill) and builds a plan, then gets scored against
// what the real vet did. Blue throughout, so it never looks like the clinic's own (red) screens.
// The game lives in sessionStorage, so a reload keeps it.

import { useEffect, useMemo, useState } from "react";
import { AppHeader, PageIntro } from "@/components/AppChrome";
import { OwnerChat, type ChatMessage } from "@/components/practice/OwnerChat";
import { PracticeBill } from "@/components/practice/PracticeBill";
import { ScoreCard } from "@/components/practice/ScoreCard";
import { TestPicker } from "@/components/practice/TestPicker";
import { api } from "@/lib/api";
import { describePet } from "@/lib/pet";
import { speciesNoun } from "@/lib/species";
import type { CatalogItem, GradeResponse, Group, PracticeCase, PracticeItem, TestResponse } from "@/lib/types";
import { card, focusRing, secondaryButton, sectionLabel } from "@/lib/ui";

interface Game {
  case: PracticeCase;
  messages: ChatMessage[];
  ownerFound: string[]; // symptom ids the owner confirmed
  tests: TestResponse[]; // in the order they were run
  plan: PracticeItem[];
  result: GradeResponse | null;
}

const STORAGE_KEY = "isthmus-practice-game";
const studyButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-study px-5 py-2.5 font-semibold text-white shadow-lg shadow-study/30 transition-colors hover:bg-study-deep disabled:opacity-50 ${focusRing}`;

function loadGame(): Game | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const game = JSON.parse(raw) as Game;
    // Games saved before "Nice to have" was dropped from the plan.
    return { ...game, plan: game.plan.filter((p) => p.group !== "optional") };
  } catch {
    return null;
  }
}

function saveGame(game: Game | null) {
  try {
    if (game) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the game still works, it just won't survive a reload
  }
}

export default function PracticePage() {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [catalog, setCatalog] = useState<Map<string, CatalogItem>>(new Map());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"start" | "ask" | "grade" | null>(null);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Restore after mount (sessionStorage isn't there during server rendering).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(loadGame());
    setLoaded(true);
    api
      .catalog()
      .then((items) => setCatalog(new Map(items.map((i) => [i.id, i]))))
      .catch(() => setError("Couldn't load the price list. The backend may be waking up: wait a few seconds and refresh."));
    api
      .symptoms()
      .then((s) => setLabels(Object.fromEntries(s.map((x) => [x.id, x.label]))))
      .catch(() => {});
  }, []);

  function update(fn: (g: Game) => Game) {
    setGame((g) => {
      if (!g) return g;
      const next = fn(g);
      saveGame(next);
      return next;
    });
  }

  async function start() {
    setBusy("start");
    setError(null);
    try {
      const c = await api.practiceCase(game?.case.case_id);
      const next: Game = { case: c, messages: [], ownerFound: [], tests: [], plan: [], result: null };
      saveGame(next);
      setGame(next);
      window.scrollTo({ top: 0 });
    } catch {
      setError("Couldn't start a case. The backend may be waking up: wait a few seconds and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function ask(question: string) {
    if (!game) return;
    const known = [...game.ownerFound, ...game.tests.flatMap((t) => t.revealed)];
    update((g) => ({ ...g, messages: [...g.messages, { from: "student", text: question }] }));
    setBusy("ask");
    try {
      const r = await api.practiceAsk(game.case.case_id, question, known);
      update((g) => ({
        ...g,
        messages: [...g.messages, { from: "owner", text: r.answer }],
        ownerFound: [...new Set([...g.ownerFound, ...r.revealed])],
      }));
    } catch {
      update((g) => ({
        ...g,
        messages: [...g.messages, { from: "owner", text: "(Couldn't reach the owner. Try asking again.)" }],
      }));
    } finally {
      setBusy(null);
    }
  }

  async function runTest(item: CatalogItem) {
    if (!game) return;
    setRunningTest(item.id);
    setError(null);
    try {
      const r = await api.practiceTest(game.case.case_id, item.id);
      update((g) => ({
        ...g,
        tests: g.tests.some((t) => t.catalog_id === r.catalog_id) ? g.tests : [...g.tests, r],
        plan: g.plan.filter((p) => p.catalog_id !== r.catalog_id), // it's been done, so it's off the plan
      }));
    } catch {
      setError(`Couldn't run the ${item.name.toLowerCase()}. Try again.`);
    } finally {
      setRunningTest(null);
    }
  }

  async function submit() {
    if (!game) return;
    setBusy("grade");
    setError(null);
    try {
      const result = await api.practiceGrade(
        game.case.case_id,
        game.tests.map((t) => t.catalog_id),
        game.plan,
      );
      update((g) => ({ ...g, result }));
      window.scrollTo({ top: 0 });
    } catch {
      setError("Couldn't score the plan. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const testItems = useMemo(
    () => (game?.case.tests ?? []).map((id) => catalog.get(id)).filter((i): i is CatalogItem => i != null),
    [game?.case.tests, catalog],
  );

  const c = game?.case;
  return (
    <div className="flex-1 bg-[#eef3fa] text-ink">
      <AppHeader
        tone="study"
        title={c ? `${c.name} · ${describePet(c)}` : "Vet student practice"}
        subtitle={c ? (game?.result ? "Case scored" : "Practice case · find out what's wrong, then build a plan") : undefined}
        badge="Practice · vet students"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-essential/30 bg-essential-soft px-4 py-3 text-sm text-essential">
            {error}
          </p>
        )}

        {loaded && !game && <Intro busy={busy === "start"} onStart={start} />}

        {game && !game.result && (
          <div className="grid gap-5 lg:grid-cols-[18rem_1fr_22rem]">
            <div className="space-y-5">
              <PatientCard game={game} labels={labels} />
              <TestPicker
                tests={testItems}
                ran={new Set(game.tests.map((t) => t.catalog_id))}
                running={runningTest}
                onRun={runTest}
              />
            </div>
            <OwnerChat petName={game.case.name} messages={game.messages} busy={busy === "ask"} onAsk={ask} />
            <div className="space-y-4">
              <PracticeBill
                catalog={catalog}
                tests={game.tests.map((t) => t.catalog_id)}
                plan={game.plan}
                onAdd={(id, group) =>
                  update((g) => ({ ...g, plan: [...g.plan.filter((p) => p.catalog_id !== id), { catalog_id: id, group }] }))
                }
                onMove={(id, group: Group) =>
                  update((g) => ({ ...g, plan: g.plan.map((p) => (p.catalog_id === id ? { ...p, group } : p)) }))
                }
                onRemove={(id) => update((g) => ({ ...g, plan: g.plan.filter((p) => p.catalog_id !== id) }))}
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy === "grade" || (game.plan.length === 0 && game.tests.length === 0)}
                className={`${studyButton} w-full py-3`}
              >
                {busy === "grade" ? "Scoring…" : "Submit plan for scoring"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Give up on this case and start a new one?")) start();
                }}
                className={`${secondaryButton} w-full`}
              >
                Skip to a new case
              </button>
            </div>
          </div>
        )}

        {game?.result && (
          <div className="space-y-5">
            <PageIntro
              tone="study"
              eyebrow="Case scored"
              title={`How you did with ${game.case.name}`}
              subtitle="Full marks need 95% of the Essential now items and 75% of the Recommended soon items. Nice-to-haves aren't scored."
            />
            <ScoreCard result={game.result} petName={game.case.name} />
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={start} disabled={busy === "start"} className={studyButton}>
                {busy === "start" ? "Finding a case…" : "Try another case"} <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Intro({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const steps = [
    ["Meet the patient", "You get what you'd know at check-in: name, species, breed, age and weight."],
    ["Talk to the owner", "Ask questions in the chat. The owner only knows what's in the real case record."],
    ["Run tests", "Search for the test you think you need. Each one is added to the bill under Tests run."],
    ["Build the plan", "Sort treatments into Essential now and Recommended soon."],
    ["Get scored", "Compared with what the real vet chose. Unneeded items cost you a few points."],
  ];
  return (
    <div className="max-w-4xl space-y-8 pt-2">
      <PageIntro
        tone="study"
        eyebrow="For vet students"
        title={
          <>
            <span className="text-study">Practice</span> cases
          </>
        }
        subtitle="Work up a real past case from scratch, then see how your plan compares with the vet's."
      />
      <ol className={`${card} divide-y divide-line`}>
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4 p-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-study-soft text-sm font-bold text-study">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-slate">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onStart} disabled={busy} className={studyButton}>
        {busy ? "Finding a case…" : "Start a case"} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function PatientCard({ game, labels }: { game: Game; labels: Record<string, string> }) {
  const c = game.case;
  const rows: [string, string][] = [
    ["Species", speciesNoun(c.species)],
    ["Breed", c.breed ?? "Unknown"],
    ["Age", c.age_years != null ? `${c.age_years} years` : "Unknown"],
    ["Weight", c.weight_lbs != null ? `${c.weight_lbs} lbs` : "Unknown"],
  ];
  const label = (id: string) => labels[id] ?? id.replace(/-/g, " ");
  return (
    <section aria-label="Patient" className={`${card} p-4`}>
      <h2 className={sectionLabel}>Patient</h2>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{c.name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="capitalize">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className={`${sectionLabel} mt-5`}>Findings</h2>
      {game.ownerFound.length === 0 && game.tests.length === 0 && (
        <p className="mt-1 text-xs text-muted">Nothing yet. Ask the owner or run a test.</p>
      )}
      {game.ownerFound.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate">Owner reports</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {game.ownerFound.map((s) => (
              <li key={s} className="rounded-full bg-study-soft px-2.5 py-0.5 text-xs font-medium text-study-deep">
                {label(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {game.tests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {game.tests.map((t) => (
            <li key={t.catalog_id} className="rounded-lg border border-line p-2.5">
              <p className="text-xs font-semibold text-study">{t.name}</p>
              {t.findings.length === 0 ? (
                <p className="mt-0.5 text-xs text-muted">No abnormal findings.</p>
              ) : (
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
                  {t.findings.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
