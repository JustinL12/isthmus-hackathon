"use client";

import { DndContext, type DragEndEvent, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { type ReactNode, useCallback, useId, useState } from "react";
import { money, todayTotal } from "@/lib/plan-math";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";
import { ItemCard } from "./ItemCard";
import { ItemDetailsDialog } from "./ItemDetailsDialog";

export const GROUP_TONE: Record<Group, string> = {
  essential: "bg-essential-soft text-essential",
  soon: "bg-soon-soft text-soon",
  optional: "bg-optional-soft text-optional",
};

/**
 * Three stacked groups (Essential / Soon / Optional).
 * - draggable: vet can move items between groups
 * - onToggle: owner can tick items on/off for today
 * - expandable: each item gets a button that opens a larger details view
 */
export function GroupBoard({
  items,
  petName,
  draggable = false,
  detailsAlwaysVisible = false,
  expandable = false,
  onMove,
  onToggle,
}: {
  items: PlanItem[];
  petName?: string;
  draggable?: boolean;
  detailsAlwaysVisible?: boolean;
  expandable?: boolean;
  onMove?: (itemId: string, group: Group) => void;
  onToggle?: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState<{ id: string; originY: number } | null>(null);
  const closeDetails = useCallback(() => setExpanded(null), []);
  const expandedItem = expanded && items.find((i) => i.id === expanded.id);
  const expandedGroup = expandedItem && GROUPS.find((g) => g.id === expandedItem.group);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // Stable id so dnd-kit's aria ids match between server and client render.
  const dndId = useId();

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) onMove?.(String(active.id), over.id as Group);
  };

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        {GROUPS.map((g) => {
          const groupItems = items.filter((i) => i.group === g.id);
          return (
            <Section
              key={g.id}
              id={g.id}
              label={g.label}
              hint={petName ? g.hint.replace("your pet", petName) : g.hint}
              summary={`${money(todayTotal(groupItems))} selected`}
            >
              {groupItems.map((i) => {
                const card = (
                  <ItemCard
                    item={i}
                    onToggle={onToggle && (() => onToggle(i.id))}
                    detailsAlwaysVisible={detailsAlwaysVisible}
                    onExpand={expandable ? (originY) => setExpanded({ id: i.id, originY }) : undefined}
                  />
                );
                return draggable ? <Draggable key={i.id} id={i.id}>{card}</Draggable> : <div key={i.id}>{card}</div>;
              })}
              {groupItems.length === 0 && (
                <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
                  {draggable ? "Drag an item here" : "No items"}
                </p>
              )}
            </Section>
          );
        })}
      </div>

      <AnimatePresence>
        {expandedItem && expandedGroup && (
          <ItemDetailsDialog
            key={expandedItem.id}
            item={expandedItem}
            petName={petName ?? "your pet"}
            groupLabel={expandedGroup.label}
            toneClassName={GROUP_TONE[expandedItem.group]}
            originY={expanded.originY}
            onClose={closeDetails}
          />
        )}
      </AnimatePresence>
    </DndContext>
  );
}

function Section({
  id,
  label,
  hint,
  summary,
  children,
}: {
  id: Group;
  label: string;
  hint: string;
  summary: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={`-mx-2 rounded-2xl p-2 transition-colors ${isOver ? "bg-primary-soft" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className={`rounded-md px-2 py-0.5 text-xs font-semibold ${GROUP_TONE[id]}`}>{label}</h2>
        <p className="text-sm text-muted">{hint}</p>
        <span className="ml-auto text-sm text-muted tabular-nums">{summary}</span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  );
}

function Draggable({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-manipulation cursor-grab ${isDragging ? "relative z-10 cursor-grabbing rounded-xl shadow-lg" : ""}`}
    >
      {children}
    </div>
  );
}
