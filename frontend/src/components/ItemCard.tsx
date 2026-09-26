"use client";

import { useState } from "react";
import type { PlanItem } from "@/lib/types";
import { money } from "@/lib/plan-math";

export function ItemCard({ item, onToggle }: { item: PlanItem; onToggle?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border bg-white p-3 text-black ${item.selected ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        {onToggle && (
          <input type="checkbox" checked={item.selected} onChange={onToggle} className="h-5 w-5" />
        )}
        <button className="flex-1 text-left font-medium" onClick={() => setOpen(!open)}>
          {item.name}
        </button>
        <span className="font-semibold">{money(item.price)}</span>
      </div>
      {open && item.explanation && (
        <dl className="mt-2 space-y-1 text-sm text-gray-700">
          <div><dt className="inline font-semibold">What: </dt><dd className="inline">{item.explanation.what}</dd></div>
          <div><dt className="inline font-semibold">Why: </dt><dd className="inline">{item.explanation.why}</dd></div>
          <div><dt className="inline font-semibold">If postponed: </dt><dd className="inline">{item.explanation.if_postponed}</dd></div>
        </dl>
      )}
      {open && item.vet_note && <p className="mt-2 text-sm italic">Vet note: {item.vet_note}</p>}
    </div>
  );
}
