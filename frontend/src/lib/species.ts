// Species a visit can be for. Mirrors backend/app/species.py (ids, noun and plural);
// backend/tests/test_species.py checks the two lists match. `keywords` help the species
// search find e.g. rabbit from "bunny" or the birds from "bird".

export const SPECIES = [
  { id: "cat", noun: "cat", plural: "cats", group: "Cats and dogs", keywords: ["kitten", "kitty", "feline"] },
  { id: "dog", noun: "dog", plural: "dogs", group: "Cats and dogs", keywords: ["puppy", "canine"] },
  { id: "rabbit", noun: "rabbit", plural: "rabbits", group: "Small mammals", keywords: ["bunny"] },
  { id: "guinea-pig", noun: "guinea pig", plural: "guinea pigs", group: "Small mammals", keywords: ["cavy", "rodent"] },
  { id: "hamster", noun: "hamster", plural: "hamsters", group: "Small mammals", keywords: ["rodent"] },
  { id: "gerbil", noun: "gerbil", plural: "gerbils", group: "Small mammals", keywords: ["rodent"] },
  { id: "rat", noun: "rat", plural: "rats", group: "Small mammals", keywords: ["rodent"] },
  { id: "mouse", noun: "mouse", plural: "mice", group: "Small mammals", keywords: ["mice", "rodent"] },
  { id: "chinchilla", noun: "chinchilla", plural: "chinchillas", group: "Small mammals", keywords: ["rodent"] },
  { id: "ferret", noun: "ferret", plural: "ferrets", group: "Small mammals", keywords: [] },
  { id: "hedgehog", noun: "hedgehog", plural: "hedgehogs", group: "Small mammals", keywords: [] },
  { id: "sugar-glider", noun: "sugar glider", plural: "sugar gliders", group: "Small mammals", keywords: ["marsupial"] },
  { id: "parrot", noun: "parrot", plural: "parrots", group: "Birds", keywords: ["bird", "macaw", "conure", "african grey"] },
  { id: "budgie", noun: "budgie", plural: "budgies", group: "Birds", keywords: ["bird", "parakeet", "budgerigar"] },
  { id: "cockatiel", noun: "cockatiel", plural: "cockatiels", group: "Birds", keywords: ["bird"] },
  { id: "canary", noun: "canary", plural: "canaries", group: "Birds", keywords: ["bird", "finch"] },
  { id: "chicken", noun: "chicken", plural: "chickens", group: "Birds", keywords: ["bird", "hen", "poultry"] },
  { id: "duck", noun: "duck", plural: "ducks", group: "Birds", keywords: ["bird", "poultry"] },
  { id: "bearded-dragon", noun: "bearded dragon", plural: "bearded dragons", group: "Reptiles", keywords: ["reptile", "lizard"] },
  { id: "leopard-gecko", noun: "leopard gecko", plural: "leopard geckos", group: "Reptiles", keywords: ["reptile", "lizard"] },
  { id: "snake", noun: "snake", plural: "snakes", group: "Reptiles", keywords: ["reptile", "python", "boa"] },
  { id: "turtle", noun: "turtle", plural: "turtles", group: "Reptiles", keywords: ["reptile"] },
  { id: "tortoise", noun: "tortoise", plural: "tortoises", group: "Reptiles", keywords: ["reptile"] },
  { id: "fish", noun: "fish", plural: "fish", group: "Fish", keywords: ["goldfish", "koi", "betta"] },
  { id: "horse", noun: "horse", plural: "horses", group: "Farm animals", keywords: ["pony", "equine"] },
  { id: "goat", noun: "goat", plural: "goats", group: "Farm animals", keywords: ["livestock"] },
  { id: "pig", noun: "pig", plural: "pigs", group: "Farm animals", keywords: ["pot-bellied", "livestock"] },
  { id: "other", noun: "animal", plural: "animals", group: "Other", keywords: ["exotic", "other"] },
] as const;

export type SpeciesInfo = (typeof SPECIES)[number];
export type Species = SpeciesInfo["id"];

const BY_ID: Record<string, SpeciesInfo> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const isSpecies = (value: unknown): value is Species => typeof value === "string" && value in BY_ID;

/** "guinea pig" (for sentences; unknown ids come back unchanged). */
export const speciesNoun = (id: string) => BY_ID[id]?.noun ?? id;

/** "guinea pigs", "mice". */
export const speciesPlural = (id: string) => BY_ID[id]?.plural ?? `${id}s`;

/** "Guinea pig", or "Other animal" (for the species picker). */
export const speciesLabel = (id: string) =>
  id === "other" ? "Other animal" : speciesNoun(id).charAt(0).toUpperCase() + speciesNoun(id).slice(1);

/** Species whose name, group or search words match every word of the query (all of them for ""). */
export function searchSpecies(query: string): SpeciesInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...SPECIES];
  const hits = SPECIES.filter((s) => {
    const text = [speciesLabel(s.id), s.noun, s.plural, s.group, ...s.keywords].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
  // Names that start with the query first ("ca" -> cat, canary before other matches).
  const starts = (s: SpeciesInfo) => speciesLabel(s.id).toLowerCase().startsWith(words.join(" "));
  return [...hits.filter(starts), ...hits.filter((s) => !starts(s))];
}
