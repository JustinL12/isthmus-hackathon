"""Which facts a student's question to the pet owner is about (practice mode).

Gemini (free tier) only classifies the question into a fixed set of options: symptom ids,
"why are you here", "anything else", and basic details. The reply itself is written by
practice.compose_answer from the stored case, so the AI can't invent anything. Without
GEMINI_API_KEY, or if Gemini fails, simple keyword matching does the same job.
"""

import json
import logging
import os
import re

import httpx

from .. import store
from .practice import BASICS

log = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.5-flash-lite"  # free tier; override with GEMINI_MODEL when Google retires it
TIMEOUT_S = 10


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


SYSTEM = """A veterinary student is talking to a pet owner. Classify the student's question; \
do not answer it. Return:
- symptoms: ids of every symptom from the list the question asks about (directly or in other words, \
e.g. "is she throwing up?" -> vomiting; "how is his appetite?" -> not-eating). Empty if none.
- reason: true if the question asks why they came in / what the problem is / what's going on.
- anything_else: true if it asks whether there is anything else, any other problems or changes.
- basics: which of name, species, breed, age, weight the question asks about.
Questions about anything else (diet, history, vaccines, behaviour not in the list...) get empty \
lists and false. Only use ids from the list."""


def _schema() -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "symptoms": {"type": "ARRAY", "items": {"type": "STRING", "enum": sorted(store.symptoms())}},
            "reason": {"type": "BOOLEAN"},
            "anything_else": {"type": "BOOLEAN"},
            "basics": {"type": "ARRAY", "items": {"type": "STRING", "enum": list(BASICS)}},
        },
        "required": ["symptoms", "reason", "anything_else", "basics"],
    }


async def _gemini(question: str) -> dict:
    menu = "\n".join(f"- {s.id}: {s.label}" for s in store.symptoms().values())
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": f"Symptoms:\n{menu}\n\nQuestion: {question}"}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": _schema(),
        },
    }
    model = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
        resp = await http.post(url, json=body, headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]})
        resp.raise_for_status()
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    out = json.loads(text)
    if not isinstance(out, dict):
        raise ValueError("Gemini returned no object")
    return out


# ---- Keyword fallback ----

KEYWORDS: dict[str, list[str]] = {
    "vomiting": ["vomit", "throw up", "throwing up", "threw up", "puk", "sick to"],
    "diarrhea": ["diarrh", "loose stool", "runny stool", "poop", "stool", "bowel"],
    "not-eating": ["eat", "appetite", "food", "hungry"],
    "weight-loss": ["weight loss", "losing weight", "lost weight", "thinner", "skinny"],
    "lethargy": ["letharg", "tired", "energy", "sleep", "active", "sluggish"],
    "drinking-more": ["drink", "thirst", "water"],
    "urinating-more": ["pee", "urinat", "litter", "accident"],
    "straining-to-urinate": ["strain"],
    "blood-in-urine": ["blood in", "bloody", "red urine", "pink urine"],
    "coughing": ["cough"],
    "sneezing": ["sneez", "runny nose", "nasal", "nose"],
    "breathing-trouble": ["breath", "pant", "wheez"],
    "limping": ["limp", "walk", "leg", "lame"],
    "pain": ["pain", "hurt", "sore", "cry", "whimper"],
    "swelling": ["swell", "swollen"],
    "itching": ["itch", "scratch", "lick", "chew"],
    "hair-loss": ["hair", "fur", "bald", "coat"],
    "ear-scratching": ["ear", "head shak"],
    "eye-discharge": ["eye discharge", "goop", "eyes", "eye"],
    "squinting": ["squint"],
    "bad-breath": ["breath smell", "bad breath", "teeth", "dental", "mouth", "gum"],
    "lump": ["lump", "bump", "mass", "growth"],
    "wound": ["wound", "cut", "bite", "bleed", "injur"],
    "seizure": ["seiz", "fit", "convuls", "trembl"],
    "ate-something": ["ate something", "swallow", "got into", "toy", "garbage", "trash"],
    "wellness": ["checkup", "check-up", "vaccin", "shots", "wellness", "routine"],
}
REASON = ["why", "what brings", "brought", "what's going on", "whats going on", "what is going on",
          "problem", "wrong", "concern", "reason", "what happened", "how can i help"]
ANYTHING_ELSE = ["anything else", "any other", "else", "other symptoms", "other changes", "other problems"]
BASIC_WORDS = {
    "name": ["name", "called"],
    "species": ["species", "what kind of animal", "cat or dog", "dog or cat"],
    "breed": ["breed", "what kind of", "mix"],
    "age": ["old", "age", "born", "birthday"],
    "weight": ["weigh", "pounds", "lbs", "heavy"],
}


def _has(q: str, words: list[str]) -> bool:
    return any(re.search(r"\b" + re.escape(w), q) for w in words)


def keyword_classify(question: str) -> dict:
    q = " ".join(question.lower().split())
    symptoms = [s for s, words in KEYWORDS.items() if s in store.symptoms() and _has(q, words)]
    # "bad breath" isn't a breathing problem
    if "bad-breath" in symptoms and "breathing-trouble" in symptoms and not _has(q, ["breathing", "pant", "wheez"]):
        symptoms.remove("breathing-trouble")
    basics = [f for f, words in BASIC_WORDS.items() if _has(q, words)]
    if "weight-loss" in symptoms and "weight" in basics:  # "losing weight?" is the symptom, not the scale
        basics.remove("weight")
    return {
        "symptoms": symptoms,
        "reason": _has(q, REASON),
        "anything_else": _has(q, ANYTHING_ELSE),
        "basics": basics,
    }


async def classify(question: str) -> dict:
    if is_configured():
        try:
            return await _gemini(question)
        except Exception:
            log.exception("Gemini owner classification failed; using keywords")
    return keyword_classify(question)
