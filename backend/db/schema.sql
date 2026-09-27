-- Isthmus Care app database (Neon Postgres).
-- Safe to re-run: `python -m scripts.seed` applies this, then upserts app/data/*.json.

create table if not exists catalog_items (
  id            text primary key,
  name          text not null,
  code          text,
  price         numeric(10, 2) not null,
  aliases       text[] not null default '{}',
  default_group jsonb not null default '{}'   -- { template_id: 'essential' | 'soon' | 'optional' }
);

create table if not exists explanations (
  catalog_id   text primary key references catalog_items (id),
  what         text not null,
  why          text not null,
  if_postponed text not null
);

create table if not exists templates (
  id       text primary key,
  name     text not null,
  species  text not null,
  item_ids text[] not null,
  symptoms text[] not null default '{}'
);

create table if not exists resources (
  id          text primary key,
  sort_order  int not null default 0,
  name        text not null,
  offers      text not null,
  eligibility text,
  url         text,
  phone       text
);

-- Items live in one jsonb column: PATCH replaces the whole list, and the
-- Databricks export flattens it.
create table if not exists plans (
  id             text primary key,
  pet            jsonb not null,              -- { name, species, age_years, breed, weight_lbs, reason }
  owner_name     text not null,
  owner_email    text,
  budget         numeric(10, 2),
  payment_choice text not null default 'pay_today',
  status         text not null default 'draft',
  share_token    text unique,
  symptoms       text[] not null default '{}',
  notes          text,
  source         text not null default 'template',  -- 'suggest' | 'template'
  items          jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Clinic price-list edits (added after launch, safe to re-run).
alter table catalog_items add column if not exists active boolean not null default true;
alter table catalog_items add column if not exists updated_at timestamptz not null default now();

-- Symptom list. Seeded from app/data/symptoms.json, and vets can add their own.
create table if not exists symptoms (
  id         text primary key,
  label      text not null,
  species    text[] not null default '{cat,dog}',
  created_at timestamptz not null default now()
);

-- The AI draft a plan started from, so vet changes can be learned from.
alter table plans add column if not exists suggested jsonb not null default '[]';

-- Patient-aware templates: who each template is for, and templates the AI made from past visits.
alter table templates add column if not exists age_min double precision;
alter table templates add column if not exists age_max double precision;
alter table templates add column if not exists weight_min_lbs double precision;
alter table templates add column if not exists weight_max_lbs double precision;
alter table templates add column if not exists breeds text[] not null default '{}';
alter table templates add column if not exists groups jsonb not null default '{}';  -- { catalog_id: group }
alter table templates add column if not exists origin text not null default 'clinic';  -- 'clinic' | 'ai'
alter table templates add column if not exists based_on int not null default 0;
alter table templates add column if not exists summary text;
alter table templates add column if not exists active boolean not null default true;
alter table templates add column if not exists created_at timestamptz not null default now();

-- Fuller treatment details for the item details dialog (the clinic can edit them).
alter table explanations add column if not exists steps text;
alter table explanations add column if not exists cost_includes text;
alter table explanations add column if not exists questions text[] not null default '{}';

-- What the vet started from: a template id, 'ai' or 'blank'.
alter table plans add column if not exists template_id text;
