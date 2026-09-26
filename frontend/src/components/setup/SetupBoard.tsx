"use client";

import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useState } from "react";
import { money } from "@/lib/plan-math";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";
import { SetupItemCard, SetupItemPreview } from "./SetupItemCard";

const GROUP_IDS = new Set<UniqueIdentifier>(GROUPS.map((g) => g.id));
const groupLabel = (id: UniqueIdentifier | undefined) => GROUPS.find((g) => g.id === id)?.label ?? "no group";

// The focused group gets the remaining width; the other two shrink to narrow summary columns.
// Columns keep their order so each group stays in the same place. (Literal strings so Tailwind sees them.)
const LAYOUT: Record<Group, string> = {
  essential: "md:grid-cols-[minmax(0,1fr)_9rem_9rem] lg:grid-cols-[minmax(0,1fr)_11rem_11rem]",
  soon: "md:grid-cols-[9rem_minmax(0,1fr)_9rem] lg:grid-cols-[11rem_minmax(0,1fr)_11rem]",
  optional: "md:grid-cols-[9rem_9rem_minmax(0,1fr)] lg:grid-cols-[11rem_11rem_minmax(0,1fr)]",
};

// Drop into the column under the pointer; fall back to overlap for keyboard dragging.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

/**
 * Vet setup board. One group is focused (expanded, full cards); the others are collapsed to a
 * summary. Dropping an item on any group moves it there and focuses that group.
 */
export function SetupBoard({
  items,
  codes,
  focused,
  onFocus,
  onMove,
  onRemove,
  onNote,
}: {
  items: PlanItem[];
  codes: Record<string, string>; // catalog id -> service code
  focused: Group;
  onFocus: (group: Group) => void;
  onMove: (itemId: string, group: Group) => void;
  onRemove: (itemId: string) => void;
  onNote: (itemId: string, note: string | null) => void;
}) {
  const sensors = useSensors(
    // Handles are touch-action: none, so pointer events cover mouse, pen and touch.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((i) => i.id === activeId) ?? null;

  const name = (id: UniqueIdentifier) => items.find((i) => i.id === id)?.name ?? "Item";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is over ${groupLabel(over.id)}.` : `${name(active.id)} is not over a group.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} moved to ${groupLabel(over.id)}.` : `${name(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Cancelled. ${name(active.id)} was not moved.`,
  };

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || !GROUP_IDS.has(over.id)) return;
    const target = over.id as Group;
    const item = items.find((i) => i.id === active.id);
    if (!item || item.group === target) return;
    onMove(item.id, target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={`grid gap-3 md:gap-4 ${LAYOUT[focused]}`}>
        {GROUPS.map((g) => {
          const groupItems = items.filter((i) => i.group === g.id);
          const subtotal = groupItems.reduce((sum, i) => sum + i.price, 0);
          return g.id === focused ? (
            <FocusedColumn key={g.id} id={g.id} label={g.label} hint={g.hint} count={groupItems.length} subtotal={subtotal}>
              {groupItems.map((i) => (
                <SetupItemCard
                  key={i.id}
                  item={i}
                  code={codes[i.catalog_id]}
                  onMove={(group) => onMove(i.id, group)}
                  onRemove={() => onRemove(i.id)}
                  onNote={(note) => onNote(i.id, note)}
                />
              ))}
            </FocusedColumn>
          ) : (
            <CollapsedColumn
              key={g.id}
              id={g.id}
              label={g.label}
              count={groupItems.length}
              subtotal={subtotal}
              dropHint={active != null && active.group !== g.id}
              onOpen={() => onFocus(g.id)}
            >
              {groupItems.map((i) => (
                <CompactItem key={i.id} item={i} onOpen={() => onFocus(g.id)} />
              ))}
            </CollapsedColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{active && <SetupItemPreview item={active} />}</DragOverlay>
    </DndContext>
  );
}

const summary = (count: number, subtotal: number) => `${count} ${count === 1 ? "item" : "items"} · ${money(subtotal)}`;

function FocusedColumn({
  id,
  label,
  hint,
  count,
  subtotal,
  children,
}: {
  id: Group;
  label: string;
  hint: string;
  count: number;
  subtotal: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`@container flex min-h-48 flex-col rounded-xl border-2 p-3 text-black transition-colors ${
        isOver ? "border-blue-400 bg-blue-100" : "border-gray-300 bg-gray-100"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{label}</h2>
        <span className="text-sm font-semibold tabular-nums text-gray-700">{summary(count, subtotal)}</span>
      </div>
      <p className="mb-3 text-sm text-gray-600">{hint}</p>
      {count === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No items here yet. Drag items onto this group or add them from the price list.
        </p>
      ) : (
        // Two columns of cards once there's room, so long plans need less scrolling.
        <div className="grid content-start gap-2 @min-[40rem]:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

function CollapsedColumn({
  id,
  label,
  count,
  subtotal,
  dropHint,
  onOpen,
  children,
}: {
  id: Group;
  label: string;
  count: number;
  subtotal: number;
  dropHint: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`flex flex-col rounded-xl p-2 text-black transition-colors ${
        isOver ? "bg-blue-100 ring-2 ring-blue-400" : "bg-gray-100"
      }`}
    >
      <button
        onClick={onOpen}
        aria-expanded={false}
        className="w-full rounded-lg p-2 text-left hover:bg-gray-200"
      >
        <span className="flex items-center justify-between gap-1 font-bold leading-tight">
          {label}
          <span aria-hidden="true" className="text-gray-400">›</span>
        </span>
        <span className="block text-sm font-semibold tabular-nums text-gray-600">{summary(count, subtotal)}</span>
      </button>
      {/* Item names are hidden on phones, where collapsed groups are just a header bar. */}
      <ul className="mt-1 hidden space-y-1 md:block">{children}</ul>
      {dropHint && (
        <p
          className={`mt-2 flex flex-1 items-center justify-center rounded-lg border-2 border-dashed p-3 text-center text-sm ${
            isOver ? "border-blue-400 text-blue-700" : "border-gray-300 text-gray-500"
          }`}
        >
          Drop to move here
        </p>
      )}
    </section>
  );
}

/** One line per item in a collapsed group: tap to open the group, or drag it to another group. */
function CompactItem({ item, onOpen }: { item: PlanItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <li>
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onOpen}
        aria-label={`${item.name}, ${money(item.price)}. Drag to move it to another group.`}
        className={`flex w-full touch-none items-baseline justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-left text-sm shadow-sm hover:bg-gray-50 ${
          isDragging ? "opacity-40" : ""
        }`}
      >
        <span className="min-w-0 truncate">{item.name}</span>
        <span className="shrink-0 font-medium tabular-nums text-gray-600">{money(item.price)}</span>
      </button>
    </li>
  );
}
