import type { PlanItem, TestRun } from "./types";

/** Tests already run: always billed today, whatever the owner ticks. */
export const testsTotal = (tests: TestRun[] | undefined) => (tests ?? []).reduce((sum, t) => sum + t.price, 0);

export const todayTotal = (items: PlanItem[]) =>
  items.filter((i) => i.selected).reduce((sum, i) => sum + i.price, 0);

export const fullTotal = (items: PlanItem[]) => items.reduce((sum, i) => sum + i.price, 0);

// TODO: use the clinic's real payment-plan terms.
export const SPLIT_PAYMENTS = 3;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
