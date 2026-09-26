"use client";

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { money } from "@/lib/plan-math";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";
import { focusRing } from "@/lib/ui";

/** Vet-facing item card: drag handle, group picker, remove, library explanation preview, note for the owner. */
export function SetupItemCard({
  item,
  code,
  onMove,
  onRemove,
  onNote,
}: {
  item: PlanItem;
  code?: string;
  onMove: (group: Group) => void;
  onRemove: () => void;
  onNote: (note: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: item.id });
  const [noteOpen, setNoteOpen] = useState(item.vet_note != null);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-line bg-white p-3 text-ink transition-opacity ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${item.name} to another group`}
          className={`-ml-1 flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted/70 hover:bg-cream hover:text-ink active:cursor-grabbing ${focusRing}`}
        >
          <GripIcon />
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <p className="font-semibold leading-tight">{item.name}</p>
          {code && <p className="text-xs text-muted">{code}</p>}
          {item.reason && <p className="mt-1 text-sm text-slate">AI: {item.reason}</p>}
        </div>
        <span className="pt-2 text-lg font-semibold tabular-nums">{money(item.price)}</span>
        <button
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-muted/70 hover:bg-essential-soft hover:text-bad ${focusRing}`}
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
        <select
          value={item.group}
          onChange={(e) => onMove(e.target.value as Group)}
          aria-label={`Group for ${item.name}`}
          className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        {!noteOpen && (
          <button
            onClick={() => setNoteOpen(true)}
            aria-label={`Add a note for the owner about ${item.name}`}
            className={`h-9 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary-soft ${focusRing}`}
          >
            + Note
          </button>
        )}
      </div>

      <div className="mt-2 pl-9 text-sm">
        {item.explanation ? (
          <details className="text-slate">
            <summary className="cursor-pointer text-muted hover:text-ink">What the owner will see</summary>
            <dl className="mt-1 space-y-1">
              <div><dt className="inline font-semibold text-ink">What: </dt><dd className="inline">{item.explanation.what}</dd></div>
              <div><dt className="inline font-semibold text-ink">Why: </dt><dd className="inline">{item.explanation.why}</dd></div>
              <div><dt className="inline font-semibold text-ink">If postponed: </dt><dd className="inline">{item.explanation.if_postponed}</dd></div>
            </dl>
          </details>
        ) : (
          <p className="text-soon">No library explanation yet. Consider adding a note for the owner.</p>
        )}
      </div>

      {noteOpen && (
        <div className="mt-2 pl-9">
          <label className="block text-sm font-medium" htmlFor={`note-${item.id}`}>
            Note for the owner<span className="sr-only"> about {item.name}</span>
          </label>
          <textarea
            id={`note-${item.id}`}
            value={item.vet_note ?? ""}
            onChange={(e) => onNote(e.target.value)}
            maxLength={300}
            rows={2}
            autoFocus={item.vet_note == null}
            placeholder="e.g. Recheck in 2 weeks if still vomiting."
            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={() => {
              onNote(null);
              setNoteOpen(false);
            }}
            className="py-1 text-sm text-muted hover:text-bad"
          >
            Remove note
          </button>
        </div>
      )}
    </div>
  );
}

/** Static copy of a card shown under the finger/cursor while dragging. */
export function SetupItemPreview({ item }: { item: PlanItem }) {
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-xl border border-line bg-white p-3 text-ink shadow-lg">
      <span className="text-muted/70"><GripIcon /></span>
      <span className="flex-1 font-semibold">{item.name}</span>
      <span className="text-lg font-semibold tabular-nums">{money(item.price)}</span>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
      {[3, 10, 17].flatMap((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
}
