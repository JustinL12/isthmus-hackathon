# ClearCare

A shared exam-room screen that turns a confusing vet estimate into a clear plan the owner can afford:
**essential today**, **recommended soon**, **nice to have**, fitted to the owner's budget, with a take-home summary.

Built for UW–Madison students and Madison clinics (Isthmus Hackathon).

## Repo layout

```
frontend/   Next.js + TypeScript + Tailwind + dnd-kit   → owned by Front end 1 & 2
backend/    FastAPI (Python)                            → owned by Back end and AI + content
```

### Frontend (`frontend/src`)

| Path | What | Owner |
| --- | --- | --- |
| `app/page.tsx` | Landing | FE2 |
| `app/setup/page.tsx` | Vet setup: pick template, pet/owner/budget | FE2 |
| `app/plan/[id]/arrange/page.tsx` | Vet drags items between groups | FE2 |
| `app/plan/[id]/page.tsx` | **Shared decision screen**: groups, explanations, live total, budget bar, payment toggle | FE1 |
| `app/plan/[id]/resources/page.tsx` | "Can't cover it today?" Madison resources | FE2 |
| `app/summary/[token]/page.tsx` | Take-home summary via share link | FE2 |
| `components/` | `GroupBoard` (dnd-kit), `ItemCard`, `BudgetBar`, `PaymentToggle`, `Disclaimer` | FE1 |
| `lib/types.ts` | Shared types (mirror `backend/app/models.py`) | all |
| `lib/api.ts` | Typed API client | all |

### Backend (`backend/`)

```
Frontend (Vercel) ──HTTP──> FastAPI (Render)
                               ├── Neon Postgres     catalog, templates, resources, plans (live app data)
                               ├── Databricks SQL    cases + agreed_plans tables (symptom suggestions)
                               ├── Claude API        picks and explains items from similar cases
                               └── Resend            emails the summary PDF
```

Postgres handles the many small saves from the tablet; Databricks is only hit once per visit
(suggestions) and after an agree (export, so suggestions learn from real plans).
Every service is optional: with no keys the API runs on JSON seed data + in-memory plans, and
suggestions fall back to the best-matching template. `GET /health` shows what's active.

| Path | What |
| --- | --- |
| `app/main.py` | FastAPI app, CORS, routers under `/api`, `/health` (`?warm=true` wakes Databricks) |
| `app/models.py` | Pydantic models (mirror `frontend/src/lib/types.ts`) |
| `app/store.py` | Data access: Neon when `DATABASE_URL` is set, else JSON + in-memory |
| `app/routers/reference.py` | `GET /catalog`, `/templates`, `/symptoms`, `/resources` |
| `app/routers/suggest.py` | `POST /suggest` (symptoms → grouped items) |
| `app/routers/plans.py` | `POST /plans`, `GET/PATCH /plans/{id}`, `POST /plans/{id}/agree`, `POST /plans/{id}/email`, `GET /share/{token}`, `GET /share/{token}/pdf` |
| `app/routers/ai.py` | `POST /ai/parse-estimate` (stretch, stub) |
| `app/services/suggest.py` | Fallback chain: Databricks + Claude → Databricks only → template |
| `app/services/databricks.py` | Similar-case SQL, export of agreed plans |
| `app/services/claude.py` | Claude: rank/explain suggestions; estimate parsing (stub) |
| `app/services/summary_pdf.py`, `email.py` | Take-home PDF (fpdf2) and Resend email |
| `app/services/rechecks.py` | Semester-aware recheck dates |
| `app/services/matching.py` | Match messy names ("CBC w/ diff") to catalog |
| `app/data/*.json` | Catalog (32 items), explanations, templates, symptoms, Madison resources, synthetic cases |
| `db/schema.sql` | Neon schema |
| `scripts/seed.py` | Create Neon tables + upsert `app/data` |
| `scripts/generate_cases.py` | Claude generates ~300 SAMPLE cases → `app/data/synthetic_cases.jsonl` |
| `scripts/load_databricks.py` | Create Databricks tables, load cases, `--check` runs the Mochi search |
| `tests/` | pytest; external services mocked |
| `../render.yaml` | Render deploy blueprint |

The seed data reproduces the demo: Mochi, "Vomiting senior cat" → $780 total, $360 essential.
Prices are samples. Verify resource info the week of the event.

## Running locally

**Backend** (http://localhost:8000, docs at `/docs`):

```sh
cd backend
py -m venv .venv          # Windows; use python3 elsewhere
.venv/Scripts/activate    # or: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in whichever services you have
uvicorn app.main:app --reload
pytest                    # no keys needed
```

One-time setup per service (run from `backend/`):

```sh
python -m scripts.seed              # Neon: create tables + load app/data
python -m scripts.generate_cases    # Claude: write synthetic_cases.jsonl (commit it)
python -m scripts.load_databricks   # Databricks: create tables + load cases, then print the Mochi check
```

Before the demo, open `/health?warm=true` so the Databricks warehouse is awake.

**Frontend** (http://localhost:3000):

```sh
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Demo flow

`/setup` → Build plan → `/plan/{id}/arrange` (drag) → Review with owner → `/plan/{id}` (tick items, watch total drop)
→ Agree → `/summary/{token}` (share link). "Can't cover it today?" → `/plan/{id}/resources`.

## TODO (next passes)

- [ ] Vet-student review of catalog prices and explanations
- [ ] Add/remove items and vet notes on the arrange screen
- [ ] Setup page: symptom chips → `/suggest`; summary page: PDF + email buttons
- [ ] Split-with-roommate approvals (needs a `shares` table)
- [ ] Deploy: Vercel (frontend) + Render (backend, `render.yaml`)
- [ ] Stretch: estimate PDF upload, vet student trainer
