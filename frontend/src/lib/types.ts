// Mirrors backend/app/models.py — keep them in sync.

export type Group = "essential" | "soon" | "optional";
export type PaymentChoice = "pay_today" | "split";
export type Species = "cat" | "dog";

export const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "essential", label: "Essential now", hint: "Tied to why your pet is here today" },
  { id: "soon", label: "Recommended soon", hint: "Often fine within a few days" },
  { id: "optional", label: "Nice to have", hint: "Worth discussing, flexible timing" },
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
  active: boolean; // false = removed from the clinic's price list (kept for history)
}

// ---- Clinic price list edits (/api/catalog) ----

export interface CatalogItemDetail extends CatalogItem {
  explanation: Explanation | null;
}

export interface CatalogItemCreate {
  name: string; // 1-80 chars
  price: number; // 0-100000
  code?: string;
  explanation?: Explanation | null; // all three lines required if sent
}

/** Send only the fields that changed. `active: true` restores a removed item. */
export type CatalogItemUpdate = Partial<Omit<CatalogItemCreate, "explanation">> & {
  explanation?: Explanation;
  active?: boolean;
};

export interface Template {
  id: string;
  name: string;
  species: Species;
  item_ids: string[];
  symptoms: string[];
}

export interface Symptom {
  id: string;
  label: string;
  species: Species[];
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
  species: Species;
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
  reason?: string | null; // why it was suggested
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
  symptoms: string[];
  notes: string | null;
  owner_email: string | null;
  source: "suggest" | "template";
}

// ---- /suggest ----

export interface ItemChoice {
  catalog_id: string;
  group: Group;
  reason?: string | null;
}

export interface SuggestRequest {
  species: Species;
  age_years: number | null;
  symptoms: string[];
  notes?: string | null;
}

export interface SuggestResponse {
  items: (ItemChoice & { name: string; price: number })[];
  source: "databricks+claude" | "databricks" | "template" | "none";
  similar_case_count: number;
  fallback_template_id: string | null;
}

export interface CreatePlanRequest {
  template_id?: string; // or items
  items?: ItemChoice[];
  pet: Pet;
  owner_name: string;
  budget: number | null;
  symptoms?: string[];
  notes?: string | null;
  owner_email?: string | null;
}
