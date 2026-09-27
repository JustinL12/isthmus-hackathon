"""Generate synthetic past cases (patient + symptoms -> items a vet chose) with Claude.

Run from backend/:  python -m scripts.generate_cases [--per-batch 25]
Writes app/data/synthetic_cases.jsonl (commit it, so everyone uses the same data).
These are SAMPLE cases for the demo, not real clinic records.
"""

import argparse
import json
import random

from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic  # noqa: E402

from app import store  # noqa: E402
from app.services.claude import GROUPS, MODEL  # noqa: E402

OUT = store.DATA_DIR / "synthetic_cases.jsonl"

# (species, focus) pairs so the cases cover the whole symptom list, plus breed- and size-specific
# problems so suggestions and AI templates can learn from breed, weight and age.
FOCUS = [
    ("cat", "vomiting, not eating, weight loss in older cats"),
    ("cat", "vomiting or diarrhea in young and middle-aged cats"),
    ("cat", "urinary problems: straining, blood in urine, peeing more, drinking more"),
    ("cat", "sneezing, eye discharge, squinting, breathing trouble"),
    ("cat", "wounds, bites, lumps, pain, limping, bad breath"),
    ("cat", "routine wellness, itching, hair loss, ear scratching"),
    ("dog", "vomiting, diarrhea, not eating, ate something it shouldn't"),
    ("dog", "limping, pain, swelling"),
    ("dog", "itching, hair loss, ear scratching"),
    ("dog", "coughing, breathing trouble, lethargy"),
    ("dog", "eye discharge, squinting, lumps, wounds, bad breath, seizure"),
    ("dog", "routine wellness and vaccines; drinking or peeing more in older dogs"),
    ("dog", "large and giant breeds (Labrador, German Shepherd, Golden Retriever, Great Dane): limping, pain, hip and joint problems"),
    ("dog", "brachycephalic breeds (French Bulldog, Pug, English Bulldog, Boston Terrier): breathing trouble, eye and skin problems"),
    ("dog", "toy and small breeds (Chihuahua, Yorkshire Terrier, Dachshund, Pomeranian): bad breath, dental disease, coughing, back pain"),
    ("dog", "puppies under a year: vaccines and wellness, diarrhea, vomiting, ate something it shouldn't"),
    ("cat", "Persian, Himalayan and other flat-faced cats: eye discharge, squinting, sneezing, breathing trouble"),
    ("cat", "overweight indoor cats and Maine Coons: urinary straining, peeing more, limping, breathing trouble"),
    ("cat", "kittens under a year: vaccines and wellness, diarrhea, sneezing, eye discharge"),
]

SYSTEM = """You create realistic SAMPLE veterinary cases for a demo dataset. Each case is \
a primary-care visit: the pet's species, age, breed and weight (lbs), the owner-reported \
symptoms, and the items an experienced general-practice vet would put on the estimate, each grouped as:
- essential: needed today; - soon: within 1-2 weeks; - optional: nice to have.
Use realistic breeds (US names, e.g. "Domestic Shorthair", "Labrador Retriever"; about 1 in 5 \
dogs "Mixed breed") and weights that fit the breed, age and body condition. Let breed, size and \
age shape the choices the way they would in practice (breed-typical problems, weight-based \
dosing, extra screening for seniors, vaccines for the young). Vary ages, symptom combinations \
and severity. Different vets make slightly different choices, so vary the item lists \
realistically. Almost every sick visit includes the exam."""


def tool_schema() -> dict:
    return {
        "name": "save_cases",
        "description": "Save the generated cases.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cases": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "age_years": {"type": "number"},
                            "breed": {"type": "string"},
                            "weight_lbs": {"type": "number"},
                            "symptoms": {"type": "array", "items": {"type": "string", "enum": sorted(store.symptoms())}},
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "catalog_id": {"type": "string", "enum": sorted(store.catalog())},
                                        "group": {"type": "string", "enum": GROUPS},
                                    },
                                    "required": ["catalog_id", "group"],
                                },
                            },
                        },
                        "required": ["age_years", "breed", "weight_lbs", "symptoms", "items"],
                    },
                }
            },
            "required": ["cases"],
        },
    }


def as_list(x) -> list:
    """Tool input that should be a list; occasionally it arrives JSON-encoded as a string."""
    if isinstance(x, str):
        try:
            x = json.loads(x)
        except ValueError:
            return []
    return x if isinstance(x, list) else []


def valid(case) -> dict | None:
    if isinstance(case, str):
        try:
            case = json.loads(case)
        except ValueError:
            return None
    if not isinstance(case, dict):
        return None
    catalog, symptoms = store.catalog(), store.symptoms()
    syms = [s for s in dict.fromkeys(as_list(case.get("symptoms"))) if isinstance(s, str) and s in symptoms]
    items = list({i["catalog_id"]: i for i in as_list(case.get("items"))
                  if isinstance(i, dict) and i.get("catalog_id") in catalog and i.get("group") in GROUPS}.values())
    if not syms or not items:
        return None
    breed = " ".join(str(case.get("breed") or "").split())[:60] or None
    weight = float(case.get("weight_lbs") or 0)
    return {
        "age_years": float(case.get("age_years") or 0) or None,
        "breed": breed,
        "weight_lbs": weight if 0 < weight <= 300 else None,
        "symptoms": syms,
        "items": items,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-batch", type=int, default=25)
    args = ap.parse_args()

    client = Anthropic()
    catalog_menu = "\n".join(f"- {c.id}: {c.name}" for c in store.catalog().values())
    symptom_menu = "\n".join(f"- {s.id}: {s.label}" for s in store.symptoms().values())
    cases = []
    for n, (species, focus) in enumerate(FOCUS, 1):
        batch = []
        for _attempt in range(3):  # retry a batch that came back mostly unusable
            resp = client.messages.create(
                model=MODEL,
                max_tokens=16000,
                system=SYSTEM,
                tools=[tool_schema()],
                tool_choice={"type": "tool", "name": "save_cases"},
                messages=[{"role": "user", "content": (
                    f"Generate {args.per_batch} {species} cases focused on: {focus}.\n\n"
                    f"Symptom ids:\n{symptom_menu}\n\nCatalog ids:\n{catalog_menu}"
                )}],
            )
            raw = as_list(next(b.input for b in resp.content if b.type == "tool_use").get("cases"))
            batch = [c for c in map(valid, raw) if c]
            if len(batch) >= args.per_batch // 2:
                break
        for c in batch:
            cases.append({"case_id": f"syn-{len(cases) + 1:04d}", "species": species, **c})
        print(f"[{n}/{len(FOCUS)}] {species}: {focus} -> {len(batch)} cases")

    random.Random(0).shuffle(cases)
    OUT.write_text("\n".join(json.dumps(c) for c in cases) + "\n", encoding="utf-8")
    print(f"Wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
