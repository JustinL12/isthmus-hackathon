import { money } from "@/lib/plan-math";

export function BudgetBar({ total, budget }: { total: number; budget: number | null }) {
  if (!budget) return <p className="text-lg font-semibold">Today: {money(total)}</p>;

  const over = total > budget;
  const pct = Math.min(100, (total / budget) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-lg font-semibold">
        <span>Today: {money(total)}</span>
        <span className={over ? "text-red-600" : "text-green-700"}>
          {over ? `${money(total - budget)} over` : `${money(budget - total)} under`} budget of {money(budget)}
        </span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-gray-200">
        <div
          className={`h-3 rounded-full transition-all ${over ? "bg-red-500" : "bg-green-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
