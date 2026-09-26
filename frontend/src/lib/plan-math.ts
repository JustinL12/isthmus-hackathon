import type { PlanItem } from "./types";

export const todayTotal = (items: PlanItem[]) =>
  items.filter((i) => i.selected).reduce((sum, i) => sum + i.price, 0);

export const fullTotal = (items: PlanItem[]) => items.reduce((sum, i) => sum + i.price, 0);

// TODO: use the clinic's real payment-plan terms.
export const SPLIT_PAYMENTS = 3;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
