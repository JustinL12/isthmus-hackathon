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
    { id: "pay_today", label: "Pay today" },
    { id: "split", label: `Split in ${SPLIT_PAYMENTS}` },
  ];
  const installment = total / SPLIT_PAYMENTS;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink/80">How to pay</p>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              value === o.id ? "bg-white text-ink shadow-sm" : "text-ink/70 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-good">
        {value === "pay_today"
          ? `${money(total)} due at checkout.`
          : `${SPLIT_PAYMENTS} payments of ${money(installment)}, ${money(installment)} due today.`}
      </p>
    </div>
  );
}
