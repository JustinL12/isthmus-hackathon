import type { Pet } from "./types";

type PetProfile = Pick<Pet, "species" | "age_years" | "breed" | "weight_lbs">;

/** e.g. "12-year-old Domestic Shorthair · 9.5 lbs", or just "cat" when nothing else is known. */
export function describePet({ species, age_years, breed, weight_lbs }: PetProfile): string {
  const kind = breed?.trim() || species;
  const main = age_years != null ? `${age_years}-year-old ${kind}` : kind;
  return weight_lbs != null ? `${main} · ${weight_lbs} lbs` : main;
}
