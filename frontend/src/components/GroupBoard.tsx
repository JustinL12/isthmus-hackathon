"use client";

import { DndContext, type DragEndEvent, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { GROUPS, type Group, type PlanItem } from "@/lib/types";
import { ItemCard } from "./ItemCard";

/**
 * Three columns (Essential / Soon / Optional).
 * - draggable: vet can move items between groups
 * - onToggle: owner can tick items on/off for today
 */
export function GroupBoard({
  items,
  draggable = false,
  onMove,
  onToggle,
}: {
  items: PlanItem[];
  draggable?: boolean;
  onMove?: (itemId: string, group: Group) => void;
  onToggle?: (itemId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) onMove?.(String(active.id), over.id as Group);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((g) => (
          <Column key={g.id} id={g.id} label={g.label} hint={g.hint}>
            {items
              .filter((i) => i.group === g.id)
              .map((i) => {
                const card = <ItemCard item={i} onToggle={onToggle && (() => onToggle(i.id))} />;
                return draggable ? <Draggable key={i.id} id={i.id}>{card}</Draggable> : <div key={i.id}>{card}</div>;
              })}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}

function Column({ id, label, hint, children }: { id: Group; label: string; hint: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`min-h-40 rounded-xl p-3 ${isOver ? "bg-blue-100" : "bg-gray-100"}`}>
      <h2 className="font-bold text-black">{label}</h2>
      <p className="mb-3 text-sm text-gray-600">{hint}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Draggable({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none">
      {children}
    </div>
  );
}
