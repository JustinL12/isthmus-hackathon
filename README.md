# Isthmus

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

### Backend (`backend/app`)

| Path | What | Owner |
| --- | --- | --- |
| `main.py` | FastAPI app, CORS, routers under `/api` | BE |
| `models.py` | Pydantic models (mirror `frontend/src/lib/types.ts`) | BE |
| `store.py` | Data access: JSON seed data + in-memory plans (swap for Supabase) | BE |
| `routers/reference.py` | `GET /catalog`, `/templates`, `/resources` | BE |
| `routers/plans.py` | `POST /plans`, `GET/PATCH /plans/{id}`, `POST /plans/{id}/agree`, `GET /share/{token}` | BE |
| `routers/ai.py` | `POST /ai/parse-estimate` (stretch, stub) | AI |
| `services/claude.py` | Claude API: estimate parsing, draft explanations (stubs) | AI |
| `services/matching.py` | Match messy names ("CBC w/ diff") to catalog | AI |
| `services/rechecks.py` | Semester-aware recheck dates | BE |
| `data/*.json` | Catalog, explanation library, templates, Madison resources | AI + content |
| `../supabase/schema.sql` | Postgres schema for when we move off in-memory | BE |

The seed data reproduces the demo: Mochi, "Vomiting senior cat" → $780 total, $360 essential.
Prices are samples. Verify resource info the week of the event.

## Running locally

**Backend** (http://localhost:8000, docs at `/docs`):

```sh
cd backend
py -m venv .venv          # Windows; use python3 elsewhere
.venv/Scripts/activate    # or: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

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

- [ ] Fill catalog to ~30 items; more explanations; vet-student review
- [ ] Add/remove items and vet notes on the arrange screen
- [ ] Supabase: swap `store.py`, realtime sync between tablet and phone
- [ ] Split-with-roommate approvals (`shares` table)
- [ ] Deploy: Vercel (frontend) + Render/Fly/Vercel Python (backend)
- [ ] Stretch: estimate PDF upload, PDF summary/email, vet student trainer
