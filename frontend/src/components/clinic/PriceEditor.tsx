"use client";

// Add or edit one procedure on the clinic's price list: name, billing code, price, and the
// plain-language explanation owners see on the shared screen. Remounted (key) per item, so
// the form starts from that item's saved values.

import { type FormEvent, useState } from "react";
import { ChromaticLabel } from "@/components/ChromaticLabel";
import { ApiError, api } from "@/lib/api";
import type { CatalogItem, CatalogItemDetail, Explanation } from "@/lib/types";
import { card, ctaWrapper, fieldLabel, input, inputBase, quietLink, secondaryButton, sectionLabel } from "@/lib/ui";

export const MAX_PRICE = 100_000;

// The explanation as form text: questions are one per line.
type ExplanationForm = Record<"what" | "why" | "if_postponed" | "steps" | "cost_includes" | "questions", string>;
type FieldSpec = { key: keyof ExplanationForm; label: string; hint: string };

// Required once any explanation is given (shown on item cards and the take-home summary).
const EXPLANATION_FIELDS: FieldSpec[] = [
  { key: "what", label: "What it is", hint: "In plain words, e.g. “A blood test that checks the kidneys, liver and blood cells.”" },
  { key: "why", label: "Why it matters", hint: "What it tells the vet or how it helps." },
  { key: "if_postponed", label: "If it's postponed", hint: "What could happen if the owner waits." },
];

// Optional extras for the details an owner opens on the shared screen.
const DETAIL_FIELDS: FieldSpec[] = [
  { key: "steps", label: "What happens", hint: "Step by step, and how long it takes." },
  { key: "cost_includes", label: "What the price covers", hint: "E.g. “The vaccine, giving it, and a rabies certificate.”" },
  { key: "questions", label: "Questions to ask your vet", hint: "One per line, up to 5." },
];

const MAX_QUESTIONS = 5;

function toForm(e: Explanation | null): ExplanationForm {
  return {
    what: e?.what ?? "",
    why: e?.why ?? "",
    if_postponed: e?.if_postponed ?? "",
    steps: e?.steps ?? "",
    cost_includes: e?.cost_includes ?? "",
    questions: (e?.questions ?? []).join("\n"),
  };
}

const questionList = (text: string) =>
  text
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean);

function fromForm(f: ExplanationForm): Explanation {
  return {
    what: f.what.trim(),
    why: f.why.trim(),
    if_postponed: f.if_postponed.trim(),
    steps: f.steps.trim() || null,
    cost_includes: f.cost_includes.trim() || null,
    questions: questionList(f.questions),
  };
}

const sameExplanation = (a: Explanation, b: Explanation | null) =>
  b != null &&
  a.what === b.what &&
  a.why === b.why &&
  a.if_postponed === b.if_postponed &&
  a.steps === (b.steps ?? null) &&
  a.cost_includes === (b.cost_includes ?? null) &&
  a.questions?.join("\n") === (b.questions ?? []).join("\n");

const textarea =
  "mt-1 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

export function PriceEditor({
  item,
  explanation,
  onSaved,
  onCancel,
}: {
  /** null = adding a new procedure. */
  item: CatalogItem | null;
  explanation: Explanation | null;
  onSaved: (saved: CatalogItemDetail, message: string) => void;
  onCancel: () => void;
}) {
  const adding = item == null;
  const removed = item != null && !item.active;
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [why, setWhy] = useState<ExplanationForm>(() => toForm(explanation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const priceNumber = Number(price);
  const priceValid = price.trim() !== "" && Number.isFinite(priceNumber) && priceNumber >= 0 && priceNumber <= MAX_PRICE;
  const filled = EXPLANATION_FIELDS.filter((f) => why[f.key].trim() !== "").length;
  const anyDetails = DETAIL_FIELDS.some((f) => why[f.key].trim() !== "");
  const tooManyQuestions = questionList(why.questions).length > MAX_QUESTIONS;
  // The explanation is all three main lines or none (the backend needs all three); details need them too.
  const explanationValid =
    !tooManyQuestions &&
    (filled === 0 ? explanation == null && !anyDetails : filled === EXPLANATION_FIELDS.length);
  const edited = fromForm(why);
  const explanationChanged = filled > 0 && !sameExplanation(edited, explanation);
  const changes = {
    name: name.trim() !== (item?.name ?? "") ? name.trim() : undefined,
    code: code.trim() !== (item?.code ?? "") ? code.trim() : undefined,
    price: priceValid && priceNumber !== item?.price ? priceNumber : undefined,
    explanation: explanationChanged && filled === EXPLANATION_FIELDS.length ? edited : undefined,
  };
  const dirty = Object.values(changes).some((v) => v !== undefined);
  const valid = name.trim() !== "" && priceValid && explanationValid;

  async function run(action: () => Promise<CatalogItemDetail>, message: (saved: CatalogItemDetail) => string) {
    setBusy(true);
    setError(null);
    setNameTaken(false);
    try {
      const saved = await action();
      setBusy(false);
      onSaved(saved, message(saved));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNameTaken(true);
        setError(`“${name.trim()}” is already on the price list.`);
      } else {
        setError("Couldn't save. Check that the Isthmus Care server is running, then try again.");
      }
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy || (!adding && !dirty)) return;
    if (adding) {
      void run(
        () => api.createCatalogItem({ name: name.trim(), code: code.trim(), price: priceNumber, explanation: changes.explanation }),
        (s) => `Added ${s.name}`,
      );
    } else {
      void run(() => api.updateCatalogItem(item.id, changes), (s) => `Saved ${s.name}`);
    }
  }

  const title = adding ? "Add a procedure" : removed ? item.name : `Edit ${item.name}`;

  return (
    <form onSubmit={save} className={`${card} space-y-5 p-5 sm:p-6`} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          {removed && (
            <p className="mt-1 text-sm text-muted">
              Removed from the price list. It stays on plans that already have it.
            </p>
          )}
        </div>
        <button type="button" onClick={onCancel} aria-label="Close" className={quietLink}>
          Close
        </button>
      </div>

      <fieldset disabled={removed || busy} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <label className={fieldLabel}>
            Name
            <input
              className={`mt-1 ${input} ${nameTaken ? "border-bad" : ""}`}
              value={name}
              maxLength={80}
              required
              aria-invalid={nameTaken || undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameTaken(false);
              }}
            />
          </label>
          <label className={fieldLabel}>
            Price
            <span className="relative mt-1 block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">$</span>
              <input
                className={`pl-7 pr-3 tabular-nums ${inputBase}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_PRICE}
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </span>
          </label>
        </div>
        <label className={`${fieldLabel} sm:max-w-56`}>
          Billing code <span className="font-normal text-muted">(optional)</span>
          <input className={`mt-1 ${input}`} value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
        </label>
        {!adding && changes.price !== undefined && (
          <p className="rounded-lg bg-soon-soft px-3 py-2 text-sm text-soon">
            New plans use the new price. Plans already built keep the price they were made with.
          </p>
        )}

        <div className="space-y-3 border-t border-line pt-4">
          <div>
            <h3 className={sectionLabel}>What owners see</h3>
            <p className="mt-1 text-sm text-muted">
              Shown on the shared screen when an owner opens this item.
              {explanation == null && " Fill in all three lines, or leave them all blank for now."}
            </p>
          </div>
          {EXPLANATION_FIELDS.map((f) => (
            <label key={f.key} className={fieldLabel}>
              {f.label}
              <textarea
                className={textarea}
                maxLength={400}
                value={why[f.key]}
                required={filled > 0 || anyDetails || explanation != null}
                onChange={(e) => setWhy({ ...why, [f.key]: e.target.value })}
              />
              <span className="mt-1 block text-xs font-normal text-muted">{f.hint}</span>
            </label>
          ))}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div>
            <h3 className={sectionLabel}>
              Treatment details <span className="font-normal normal-case tracking-normal">(optional)</span>
            </h3>
            <p className="mt-1 text-sm text-muted">Shown when an owner opens the item for more detail.</p>
          </div>
          {DETAIL_FIELDS.map((f) => (
            <label key={f.key} className={fieldLabel}>
              {f.label}
              <textarea
                className={textarea}
                maxLength={f.key === "questions" ? MAX_QUESTIONS * 200 : 400}
                value={why[f.key]}
                aria-invalid={(f.key === "questions" && tooManyQuestions) || undefined}
                onChange={(e) => setWhy({ ...why, [f.key]: e.target.value })}
              />
              <span className={`mt-1 block text-xs font-normal ${f.key === "questions" && tooManyQuestions ? "text-bad" : "text-muted"}`}>
                {f.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {removed ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.restoreCatalogItem(item.id), (s) => `Restored ${s.name}`)}
          className={`w-full ${ctaWrapper}`}
        >
          <ChromaticLabel texture="pine" className="py-3 text-base">
            {busy ? "Restoring…" : "Restore to the price list"}
          </ChromaticLabel>
        </button>
      ) : (
        <div className="space-y-3">
          <button type="submit" disabled={!valid || busy || (!adding && !dirty)} className={`w-full ${ctaWrapper}`}>
            <ChromaticLabel className="py-3 text-base shadow-lg shadow-badger/30">
              {busy ? "Saving…" : adding ? "Add to price list" : dirty ? "Save changes" : "No changes yet"}
            </ChromaticLabel>
          </button>
          {!adding &&
            (confirmRemove ? (
              <div className="rounded-xl border border-line bg-cream/60 p-3 text-sm">
                <p>
                  Remove <strong>{item.name}</strong>? It won&apos;t be offered in new plans, templates or AI drafts.
                  Plans that already have it keep it, and you can restore it any time.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api.removeCatalogItem(item.id), (s) => `Removed ${s.name}`)}
                    className="rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className={secondaryButton}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className={`${quietLink} text-bad`}>
                Remove from the price list
              </button>
            ))}
        </div>
      )}
    </form>
  );
}
