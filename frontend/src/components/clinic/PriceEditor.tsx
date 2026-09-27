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

const EXPLANATION_FIELDS: { key: keyof Explanation; label: string; hint: string }[] = [
  { key: "what", label: "What it is", hint: "In plain words, e.g. “A blood test that checks the kidneys, liver and blood cells.”" },
  { key: "why", label: "Why it matters", hint: "What it tells the vet or how it helps." },
  { key: "if_postponed", label: "If it's postponed", hint: "What could happen if the owner waits." },
];

const BLANK: Explanation = { what: "", why: "", if_postponed: "" };

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
  const [why, setWhy] = useState<Explanation>(explanation ?? BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const priceNumber = Number(price);
  const priceValid = price.trim() !== "" && Number.isFinite(priceNumber) && priceNumber >= 0 && priceNumber <= MAX_PRICE;
  const filled = EXPLANATION_FIELDS.filter((f) => why[f.key].trim() !== "").length;
  // The explanation is all three lines or none (the backend needs all three).
  const explanationValid = filled === 0 ? explanation == null : filled === EXPLANATION_FIELDS.length;
  const explanationChanged = EXPLANATION_FIELDS.some((f) => why[f.key].trim() !== (explanation?.[f.key] ?? "").trim());
  const changes = {
    name: name.trim() !== (item?.name ?? "") ? name.trim() : undefined,
    code: code.trim() !== (item?.code ?? "") ? code.trim() : undefined,
    price: priceValid && priceNumber !== item?.price ? priceNumber : undefined,
    explanation:
      explanationChanged && filled === EXPLANATION_FIELDS.length
        ? { what: why.what.trim(), why: why.why.trim(), if_postponed: why.if_postponed.trim() }
        : undefined,
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
                className="mt-1 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                maxLength={400}
                value={why[f.key]}
                required={filled > 0 || explanation != null}
                onChange={(e) => setWhy({ ...why, [f.key]: e.target.value })}
              />
              <span className="mt-1 block text-xs font-normal text-muted">{f.hint}</span>
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
