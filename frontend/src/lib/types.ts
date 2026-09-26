// Mirrors backend/app/models.py — keep them in sync.

export type Group = "essential" | "soon" | "optional";
export type PaymentChoice = "pay_today" | "split";

export const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "essential", label: "Essential now", hint: "Tied to why your pet is here today" },
  { id: "soon", label: "Recommended soon", hint: "Important, often fine within days or weeks" },
  { id: "optional", label: "Nice to have", hint: "Preventive or optional, flexible timing" },
];

export interface Explanation {
  what: string;
  why: string;
  if_postponed: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  code: string;
  price: number;
  aliases: string[]; // messy estimate names, e.g. "CBC w/ diff"
  default_group: Partial<Record<string, Group>>; // visit template id -> suggested group
}

export interface Template {
  id: string;
  name: string;
  species: "cat" | "dog";
  item_ids: string[];
}

export interface Resource {
  id: string;
  name: string;
  offers: string;
  eligibility?: string | null;
  url?: string | null;
  phone?: string | null;
}

export interface Pet {
  name: string;
  species: "cat" | "dog";
  age_years?: number | null;
  reason?: string;
}

export interface PlanItem {
  id: string;
  catalog_id: string;
  name: string;
  price: number;
  group: Group;
  selected: boolean;
  vet_note?: string | null;
  explanation?: Explanation | null;
  recheck_date?: string | null;
}

export interface Plan {
  id: string;
  pet: Pet;
  owner_name: string;
  budget: number | null;
  payment_choice: PaymentChoice;
  status: "draft" | "agreed";
  share_token: string | null;
  items: PlanItem[];
}
