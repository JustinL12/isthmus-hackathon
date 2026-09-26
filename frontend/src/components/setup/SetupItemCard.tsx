"use client";

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { money } from "@/lib/plan-math";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";

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
      className={`rounded-lg border border-gray-200 bg-white p-3 text-black shadow-sm ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${item.name} to another group`}
          className="-ml-1 flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        >
          <GripIcon />
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <p className="font-medium leading-tight">{item.name}</p>
          {code && <p className="text-xs text-gray-500">{code}</p>}
        </div>
        <span className="pt-2 font-semibold tabular-nums">{money(item.price)}</span>
        <button
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded text-xl text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
        <select
          value={item.group}
          onChange={(e) => onMove(e.target.value as Group)}
          aria-label={`Group for ${item.name}`}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
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
            className="h-9 rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            + Note
          </button>
        )}
      </div>

      <div className="mt-2 pl-9 text-sm">
        {item.explanation ? (
          <details className="text-gray-700">
            <summary className="cursor-pointer text-gray-500">What the owner will see</summary>
            <dl className="mt-1 space-y-1">
              <div><dt className="inline font-semibold">What: </dt><dd className="inline">{item.explanation.what}</dd></div>
              <div><dt className="inline font-semibold">Why: </dt><dd className="inline">{item.explanation.why}</dd></div>
              <div><dt className="inline font-semibold">If postponed: </dt><dd className="inline">{item.explanation.if_postponed}</dd></div>
            </dl>
          </details>
        ) : (
          <p className="text-amber-700">No library explanation yet. Consider adding a note for the owner.</p>
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
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => {
              onNote(null);
              setNoteOpen(false);
            }}
            className="py-1 text-sm text-gray-500 hover:text-red-600"
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
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border border-gray-300 bg-white p-3 text-black shadow-lg">
      <span className="text-gray-400"><GripIcon /></span>
      <span className="flex-1 font-medium">{item.name}</span>
      <span className="font-semibold tabular-nums">{money(item.price)}</span>
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
