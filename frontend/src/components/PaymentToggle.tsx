import type { PaymentChoice } from "@/lib/types";
import { SPLIT_PAYMENTS, money } from "@/lib/plan-math";

export function PaymentToggle({
  value,
  total,
  onChange,
}: {
  value: PaymentChoice;
  total: number;
  onChange: (v: PaymentChoice) => void;
}) {
  const options: { id: PaymentChoice; label: string }[] = [
    { id: "pay_today", label: `Pay today: ${money(total)}` },
    { id: "split", label: `${SPLIT_PAYMENTS} payments of ${money(total / SPLIT_PAYMENTS)}` },
  ];
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg border px-4 py-2 ${value === o.id ? "border-black bg-black text-white" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
