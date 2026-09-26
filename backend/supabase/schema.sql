-- Isthmus schema (from the project plan's data model).
-- Not wired up yet: the API uses app/store.py (JSON + in-memory) until we switch.

create table catalog_items (
  id            text primary key,
  name          text not null,
  code          text,
  price         numeric(10, 2) not null,
  aliases       text[] default '{}',
  default_group jsonb default '{}'   -- { template_id: 'essential' | 'soon' | 'optional' }
);

create table explanations (
  catalog_id   text primary key references catalog_items (id),
  what         text not null,
  why          text not null,
  if_postponed text not null,
  reviewed_by  text                  -- vet/vet student who reviewed it
);

create table templates (
  id       text primary key,
  name     text not null,
  species  text not null,
  item_ids text[] not null
);

create table plans (
  id             text primary key,
  pet            jsonb not null,     -- { name, species, age_years, reason }
  owner_name     text not null,
  budget         numeric(10, 2),
  payment_choice text not null default 'pay_today',
  status         text not null default 'draft',
  share_token    text unique,
  created_at     timestamptz default now()
);

create table plan_items (
  id           text primary key,
  plan_id      text not null references plans (id) on delete cascade,
  catalog_id   text references catalog_items (id),
  name         text not null,
  price        numeric(10, 2) not null,
  "group"      text not null,
  selected     boolean not null default true,
  vet_note     text,
  recheck_date date
);

create table resources (
  id          text primary key,
  name        text not null,
  offers      text not null,
  eligibility text,
  url         text,
  phone       text
);

create table shares (
  id           bigint generated always as identity primary key,
  plan_id      text not null references plans (id) on delete cascade,
  recipient    text not null,        -- "roommate", "parent", or an email
  approved     boolean,
  contribution numeric(10, 2),
  created_at   timestamptz default now()
);
