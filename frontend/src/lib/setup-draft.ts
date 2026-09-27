// What the vet has entered in vet setup steps 1–3, shared between the step pages.
// Kept in sessionStorage (one tab = one visit), so the step arrows, the browser's back
// button and a reload all keep it. Read through useSetupDraft(); change with updateDraft().

import { useSyncExternalStore } from "react";
import type { CreatePlanRequest, Plan, Species } from "./types";

export interface SetupDraft {
  petName: string;
  species: Species;
  age: string; // raw input text; "" = not given
  breed: string; // free text; "" = not given
  weight: string; // lbs, raw input text; "" = not given
  ownerName: string;
  budget: string; // raw input text; "" = not given
  symptoms: string[]; // symptom ids (step 2)
  notes: string; // vet notes for the AI draft (step 2)
  templateId: string; // "" = not picked yet (step 3 preselects one); or AI_DRAFT / SKIP_TEMPLATE
  /** The plan step 3 built from this draft, and the request that built it (see planRequest). */
  plan: { id: string; key: string } | null;
}

/** A new visit: everything blank. */
export const DEFAULT_DRAFT: SetupDraft = {
  petName: "",
  species: "cat",
  age: "",
  breed: "",
  weight: "",
  ownerName: "",
  budget: "",
  symptoms: [],
  notes: "",
  templateId: "",
  plan: null,
};

/** The Mochi demo (home page): the demo persona, Alex and Mochi, filled in so it takes a few taps. */
export const DEMO_DRAFT: SetupDraft = {
  ...DEFAULT_DRAFT,
  petName: "Mochi",
  age: "12",
  breed: "Domestic Shorthair",
  weight: "9.5",
  ownerName: "Alex",
  budget: "400",
  symptoms: ["vomiting", "not-eating"],
};

/** templateId meaning "build from the AI's draft for these symptoms" instead of a fixed template. */
export const AI_DRAFT = "ai";
/** templateId meaning "start with no items": the vet adds everything from the price list. */
export const SKIP_TEMPLATE = "blank";

const STORAGE_KEY = "isthmus.setupDraft";
let current: SetupDraft | null = null; // loaded from sessionStorage on first client read
const listeners = new Set<() => void>();

const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

// sessionStorage can hold anything (older shapes, hand edits), so keep only valid fields.
function sanitize(raw: unknown): SetupDraft {
  if (typeof raw !== "object" || raw == null) return DEFAULT_DRAFT;
  const r = raw as Record<string, unknown>;
  const plan = r.plan as Record<string, unknown> | null | undefined;
  return {
    petName: str(r.petName, DEFAULT_DRAFT.petName),
    species: r.species === "dog" ? "dog" : "cat",
    age: str(r.age, DEFAULT_DRAFT.age),
    breed: str(r.breed, ""),
    weight: str(r.weight, ""),
    ownerName: str(r.ownerName, DEFAULT_DRAFT.ownerName),
    budget: str(r.budget, DEFAULT_DRAFT.budget),
    symptoms: Array.isArray(r.symptoms)
      ? r.symptoms.filter((s): s is string => typeof s === "string")
      : DEFAULT_DRAFT.symptoms,
    notes: str(r.notes, ""),
    templateId: str(r.templateId, ""),
    plan: plan && typeof plan.id === "string" && typeof plan.key === "string" ? { id: plan.id, key: plan.key } : null,
  };
}

/** Current draft (client only). */
export function getDraft(): SetupDraft {
  if (!current) {
    current = DEFAULT_DRAFT;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) current = sanitize(JSON.parse(saved));
    } catch {
      // Storage blocked or bad JSON: start from the defaults.
    }
  }
  return current;
}

export function setDraft(next: SetupDraft) {
  current = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the draft still lives in memory for this page session.
  }
  listeners.forEach((notify) => notify());
}

export const updateDraft = (patch: Partial<SetupDraft>) => setDraft({ ...getDraft(), ...patch });

/** Start over: a blank visit, or the Mochi demo. */
export const resetDraft = (demo = false) => setDraft(demo ? DEMO_DRAFT : DEFAULT_DRAFT);

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** The draft, re-rendering on changes. The server render sees DEFAULT_DRAFT; gate on useHydrated(). */
export const useSetupDraft = () => useSyncExternalStore(subscribe, getDraft, () => DEFAULT_DRAFT);

const noSubscribe = () => () => {};
/** False during the server render and hydration, true after (when the saved draft is readable). */
export const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

// "" -> null; otherwise a number (callers validate first).
export const optionalNumber = (s: string) => (s.trim() === "" ? null : Number(s));

const validNumber = (s: string, min: number, max: number) => {
  if (s.trim() === "") return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max;
};

export const MAX_WEIGHT_LBS = 300;

/** Same rules as the step 1 form: names required (not just spaces), age 0–40, weight 0–300 lbs, budget ≥ 0. */
export const isPatientComplete = (d: SetupDraft) =>
  d.petName.trim() !== "" &&
  d.ownerName.trim() !== "" &&
  validNumber(d.age, 0, 40) &&
  validNumber(d.weight, 0.1, MAX_WEIGHT_LBS) &&
  validNumber(d.budget, 0, Number.POSITIVE_INFINITY);

/**
 * POST /plans body for this draft and starting point. `reason` is the visit reason shown to the owner
 * (the symptoms, else the template name). For AI_DRAFT and SKIP_TEMPLATE the caller swaps
 * template_id for `items` before sending.
 */
export function planRequest(d: SetupDraft, start: { id: string; reason: string }): CreatePlanRequest {
  return {
    template_id: start.id,
    pet: {
      name: d.petName.trim(),
      species: d.species,
      age_years: optionalNumber(d.age),
      breed: d.breed.trim() || null,
      weight_lbs: optionalNumber(d.weight),
      reason: start.reason,
    },
    owner_name: d.ownerName.trim(),
    budget: optionalNumber(d.budget),
    symptoms: d.symptoms,
    notes: d.notes.trim() || null,
  };
}

/** Identifies a request, so step 3 can tell whether the plan it built still matches the draft. */
export const requestKey = (body: CreatePlanRequest) => JSON.stringify(body);

/** Draft describing an existing plan (going back from step 4 when this tab has no draft for it). */
export function draftFromPlan(plan: Plan, templateId: string | null): SetupDraft {
  const d: SetupDraft = {
    petName: plan.pet.name,
    species: plan.pet.species,
    age: plan.pet.age_years == null ? "" : String(plan.pet.age_years),
    breed: plan.pet.breed ?? "",
    weight: plan.pet.weight_lbs == null ? "" : String(plan.pet.weight_lbs),
    ownerName: plan.owner_name,
    budget: plan.budget == null ? "" : String(plan.budget),
    symptoms: plan.symptoms,
    notes: plan.notes ?? "",
    templateId: plan.source === "suggest" ? AI_DRAFT : plan.source === "blank" ? SKIP_TEMPLATE : (templateId ?? ""),
    plan: null,
  };
  // The plan's reason is kept as is, so the symptom labels and template name aren't needed to rebuild the request.
  // Without the template the request can't be rebuilt: an empty key never matches, so step 3
  // warns that continuing starts a fresh item list instead of silently replacing this plan.
  d.plan = {
    id: plan.id,
    key: d.templateId ? requestKey(planRequest(d, { id: d.templateId, reason: plan.pet.reason ?? "" })) : "",
  };
  return d;
}
