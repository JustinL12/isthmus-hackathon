import type { CatalogItem, Explanation, Group, PlanItem } from "./types";

// Same normalization as backend/app/services/matching.py, so "CBC w/ diff" finds "CBC w/ diff".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface CatalogMatch {
  item: CatalogItem;
  /** Alias that matched, when the service name itself didn't (e.g. "CBC w/ diff" -> Blood panel). */
  alias?: string;
}

/** Every word of the query must appear in the name, code, or one alias. Name matches rank first. */
export function searchCatalog(catalog: CatalogItem[], query: string): CatalogMatch[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return catalog.map((item) => ({ item }));

  const matchesAll = (s: string) => words.every((w) => norm(s).includes(w));
  const ranked: { match: CatalogMatch; rank: number }[] = [];
  for (const item of catalog) {
    if (matchesAll(item.name)) {
      ranked.push({ match: { item }, rank: norm(item.name).startsWith(words[0]) ? 0 : 1 });
    } else if (matchesAll(item.code)) {
      ranked.push({ match: { item }, rank: 2 });
    } else {
      const alias = item.aliases.find(matchesAll);
      if (alias) ranked.push({ match: { item, alias }, rank: 2 });
    }
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.match);
}

// Textbook names vets and students may type, on top of the clinic's own shorthand (CBC, UA, 4Dx…).
const STUDY_TERMS: Record<string, string[]> = {
  exam: ["physical exam", "PE", "examination"],
  "blood-panel": ["bloodwork", "chemistry", "CBC", "complete blood count", "biochemistry", "serum chemistry"],
  urinalysis: ["urine culture", "urine sample"],
  t4: ["thyroid", "hyperthyroid"],
  "xrays-abd": ["abdominal radiographs", "abdominal x-ray", "abdomen x-ray", "radiograph"],
  "xrays-chest": ["thoracic radiographs", "chest radiographs", "thorax x-ray", "radiograph"],
  "xrays-limb": ["limb radiographs", "orthopedic radiographs", "leg radiograph", "radiograph", "bone x-ray"],
  "ultrasound-abd": ["abdominal ultrasound", "ultrasonography", "AUS"],
  fecal: ["fecal flotation", "stool sample", "parasite test", "giardia"],
  "heartworm-test": ["heartworm antigen", "SNAP 4Dx"],
  "fiv-felv": ["retrovirus", "FeLV", "FIV", "leukemia virus"],
  "ear-cytology": ["ear cytology", "otic swab", "otoscopic"],
  "skin-cytology": ["skin cytology", "skin scrape", "impression smear"],
  "eye-stain": ["fluorescein", "corneal stain", "corneal ulcer test"],
  "blood-pressure": ["blood pressure", "doppler", "systolic"],
};

/** Search diagnostics by name, code, the clinic's shorthand, or the textbook terms above. */
export const searchTests = (tests: CatalogItem[], query: string) =>
  searchCatalog(
    tests.map((t) => ({ ...t, aliases: [...t.aliases, ...(STUDY_TERMS[t.id] ?? [])] })),
    query,
  );

// crypto.randomUUID only exists in secure contexts; a tablet on http://<laptop-ip>:3000 isn't one.
export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const planItemFromCatalog = (
  item: CatalogItem,
  group: Group,
  explanations: Record<string, Explanation>,
): PlanItem => ({
  id: newItemId(),
  catalog_id: item.id,
  name: item.name,
  price: item.price,
  group,
  selected: group === "essential", // choose care starts with only the essentials ticked
  vet_note: null,
  explanation: explanations[item.id] ?? null,
  recheck_date: null,
});
