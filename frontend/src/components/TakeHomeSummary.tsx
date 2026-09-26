import type { PlanItem } from "@/lib/types";

/** Live preview of the take-home plan, built from what's ticked today. */
export function TakeHomeSummary({ items }: { items: PlanItem[] }) {
  const rows = [
    { label: "Doing today", tone: "text-essential", items: items.filter((i) => i.selected) },
    {
      label: "Scheduled for a recheck",
      tone: "text-soon",
      items: items.filter((i) => !i.selected && i.group !== "optional"),
    },
    {
      label: "Revisit at next visit",
      tone: "text-optional",
      items: items.filter((i) => !i.selected && i.group === "optional"),
    },
  ];
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Take-home summary</h3>
      {rows.map((r) => (
        <div key={r.label}>
          <p className={`text-sm font-semibold ${r.tone}`}>{r.label}</p>
          <p className="text-sm text-slate">
            {r.items.length ? r.items.map((i) => i.name).join(", ") : <span className="text-muted">Nothing</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
