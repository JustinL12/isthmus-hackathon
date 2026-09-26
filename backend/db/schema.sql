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
  pet            jsonb not null,              -- { name, species, age_years, reason }
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
