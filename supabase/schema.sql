-- ============================================================================
-- CityMate — Supabase data schema (CLAUDE.md §5, §7, §8, §9)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor.
-- It is idempotent enough to re-run during early development, but review
-- before running against data you care about (it does NOT drop tables).
--
-- Core rules enforced here:
--   * Every content row is scoped to a city (city_id NOT NULL) and city -> country.
--   * Moderated content carries status / source / verified_at.
--   * Public (anon) reads see ONLY status = 'approved' content rows.
--   * Reference data (countries/cities/categories) is publicly readable in full
--     so the welcome screen can show inactive items marked "(soon)" (§4).
--   * Writes & moderation are closed at the RLS layer — wired to the owner later.
--   * Content translations for all 13 start languages live in one linked table.
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type content_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  -- where a record came from (§7 content pipeline)
  create type content_source as enum ('manual', 'ai_parse', 'business_submission');
exception when duplicate_object then null; end $$;

do $$ begin
  -- the 13 start languages (§8). Keep in sync with src/i18n/index.js.
  create type lang_code as enum (
    'ru', 'en', 'tr', 'de', 'uk', 'pl', 'nl', 'cs', 'fr', 'fi', 'sv', 'no', 'da'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Reference tables (no moderation status; read publicly in full)
-- ----------------------------------------------------------------------------

-- Countries (Turkey, UAE, Indonesia, Thailand, ...)
create table if not exists public.countries (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,            -- ISO-3166 alpha-2, e.g. 'TR'
  name        text not null,                   -- display name (base, English)
  is_active   boolean not null default false,  -- false => shown as "(soon)"
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Cities (city -> country). Start: Turkey -> Alanya.
create table if not exists public.cities (
  id          uuid primary key default gen_random_uuid(),
  country_id  uuid not null references public.countries(id) on delete cascade,
  slug        text not null,                   -- url-safe, unique per country
  name        text not null,                   -- display name (base, English)
  latitude    double precision,
  longitude   double precision,
  is_active   boolean not null default false,  -- false => shown as "(soon)"
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (country_id, slug)
);
create index if not exists cities_country_id_idx on public.cities (country_id);

-- Category tree (Doctors, Notaries, Repairs, Shops, ...)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,                   -- display name (base, English)
  icon        text,                            -- lucide-react icon name
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  slug        text not null,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (category_id, slug)
);
create index if not exists subcategories_category_id_idx on public.subcategories (category_id);

-- ----------------------------------------------------------------------------
-- Content tables (city-scoped + moderated)
--   Shared moderation columns: status / source / verified_at.
--   NOTE: rating is intentionally NOT stored (CLAUDE.md §13 — no ratings).
-- ----------------------------------------------------------------------------

-- Places / services: companies and specialists.
create table if not exists public.places (
  id             uuid primary key default gen_random_uuid(),
  city_id        uuid not null references public.cities(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  name           text not null,
  description    text,
  address        text,
  latitude       double precision,
  longitude      double precision,
  phone          text,
  whatsapp       text,
  hours          jsonb,                         -- opening hours, free structure
  languages      lang_code[] default '{}',      -- service languages
  photos         text[] default '{}',           -- image urls
  is_verified    boolean not null default false, -- owner "verified/partner" mark (§11)
  is_promoted    boolean not null default false, -- paid placement, labelled in UI (§11/§12)
  -- moderation
  status         content_status not null default 'pending',
  source         content_source not null default 'manual',
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists places_city_status_idx on public.places (city_id, status);
create index if not exists places_category_idx on public.places (category_id);

-- Events: city listings / "what's on".
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  title        text not null,
  description  text,
  location     text,
  latitude     double precision,
  longitude    double precision,
  starts_at    timestamptz,
  ends_at      timestamptz,
  url          text,
  image_url    text,
  status       content_status not null default 'pending',
  source       content_source not null default 'manual',
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_city_status_idx on public.events (city_id, status);
create index if not exists events_starts_at_idx on public.events (starts_at);

-- Guides: "Documents & life" instructions + checklists.
create table if not exists public.guides (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  slug         text,
  title        text not null,
  body         text,                            -- markdown instructions
  checklist    jsonb,                           -- [{label, ...}] checklist items
  disclaimer   text,                            -- legal/reference disclaimer (§11)
  source_url   text,
  status       content_status not null default 'pending',
  source       content_source not null default 'manual',
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists guides_city_status_idx on public.guides (city_id, status);

-- News: short city news summaries.
create table if not exists public.news (
  id            uuid primary key default gen_random_uuid(),
  city_id       uuid not null references public.cities(id) on delete cascade,
  title         text not null,
  summary       text,                           -- what happened / who it affects / what to do
  body          text,
  source_name   text,
  source_url    text,                           -- verifiable source (§11)
  image_url     text,
  published_at  timestamptz,
  status        content_status not null default 'pending',
  source        content_source not null default 'manual',
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists news_city_status_idx on public.news (city_id, status);
create index if not exists news_published_at_idx on public.news (published_at);

-- Ads: promotional / partner cards (always visually labelled in the app, §11).
create table if not exists public.ads (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id) on delete cascade,
  place_id     uuid references public.places(id) on delete set null,
  title        text not null,
  body         text,
  image_url    text,
  link_url     text,
  placement    text,                            -- e.g. 'home_banner', 'category_top'
  starts_at    timestamptz,
  ends_at      timestamptz,
  status       content_status not null default 'pending',
  source       content_source not null default 'business_submission',
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ads_city_status_idx on public.ads (city_id, status);

-- ----------------------------------------------------------------------------
-- Content translations (one linked table for all content types, 13 langs, §8)
--   (entity_type, entity_id) points at a content row; (field) names the column
--   being translated (e.g. 'name', 'description', 'title', 'summary', 'body').
-- ----------------------------------------------------------------------------
create table if not exists public.content_translations (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('places','events','guides','news','ads')),
  entity_id    uuid not null,
  lang         lang_code not null,
  field        text not null,
  value        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (entity_type, entity_id, lang, field)
);
create index if not exists content_translations_lookup_idx
  on public.content_translations (entity_type, entity_id, lang);

-- Helper: is the parent content row approved? Used by the translation RLS policy
-- so translations of non-approved content never leak to the public (§7).
create or replace function public.content_is_approved(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_entity_type
    when 'places' then exists (select 1 from public.places  where id = p_entity_id and status = 'approved')
    when 'events' then exists (select 1 from public.events  where id = p_entity_id and status = 'approved')
    when 'guides' then exists (select 1 from public.guides  where id = p_entity_id and status = 'approved')
    when 'news'   then exists (select 1 from public.news    where id = p_entity_id and status = 'approved')
    when 'ads'    then exists (select 1 from public.ads     where id = p_entity_id and status = 'approved')
    else false
  end;
$$;

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['places','events','guides','news','ads','content_translations']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- Row Level Security
--   anon  -> read-only, gated as described below. No write policies = no writes.
--   Moderation / writes will run via the service_role key (bypasses RLS) or via
--   owner-scoped policies added in a later stage.
-- ============================================================================

alter table public.countries            enable row level security;
alter table public.cities               enable row level security;
alter table public.categories           enable row level security;
alter table public.subcategories        enable row level security;
alter table public.places               enable row level security;
alter table public.events               enable row level security;
alter table public.guides               enable row level security;
alter table public.news                 enable row level security;
alter table public.ads                  enable row level security;
alter table public.content_translations enable row level security;

-- Reference data: fully public (welcome screen shows inactive items as "(soon)").
drop policy if exists "read countries"     on public.countries;
create policy "read countries"     on public.countries     for select to anon, authenticated using (true);
drop policy if exists "read cities"        on public.cities;
create policy "read cities"        on public.cities        for select to anon, authenticated using (true);
drop policy if exists "read categories"    on public.categories;
create policy "read categories"    on public.categories    for select to anon, authenticated using (true);
drop policy if exists "read subcategories" on public.subcategories;
create policy "read subcategories" on public.subcategories for select to anon, authenticated using (true);

-- Content: public reads see ONLY approved rows.
drop policy if exists "read approved places" on public.places;
create policy "read approved places" on public.places for select to anon, authenticated using (status = 'approved');
drop policy if exists "read approved events" on public.events;
create policy "read approved events" on public.events for select to anon, authenticated using (status = 'approved');
drop policy if exists "read approved guides" on public.guides;
create policy "read approved guides" on public.guides for select to anon, authenticated using (status = 'approved');
drop policy if exists "read approved news" on public.news;
create policy "read approved news" on public.news for select to anon, authenticated using (status = 'approved');
drop policy if exists "read approved ads" on public.ads;
create policy "read approved ads" on public.ads for select to anon, authenticated using (status = 'approved');

-- Translations: readable only when their parent content row is approved.
drop policy if exists "read approved translations" on public.content_translations;
create policy "read approved translations" on public.content_translations
  for select to anon, authenticated
  using (public.content_is_approved(entity_type, entity_id));

-- Table-level grants (RLS still applies on top). No INSERT/UPDATE/DELETE granted.
grant usage on schema public to anon, authenticated;
grant select on
  public.countries, public.cities, public.categories, public.subcategories,
  public.places, public.events, public.guides, public.news, public.ads,
  public.content_translations
to anon, authenticated;

-- ============================================================================
-- Seed: Turkey -> Alanya (the launch city, §1). Safe to re-run.
-- ============================================================================
insert into public.countries (code, name, is_active, sort_order)
values ('TR', 'Turkey', true, 0)
on conflict (code) do update set is_active = excluded.is_active, name = excluded.name;

insert into public.cities (country_id, slug, name, latitude, longitude, is_active, sort_order)
select c.id, 'alanya', 'Alanya', 36.5438, 31.9997, true, 0
from public.countries c
where c.code = 'TR'
on conflict (country_id, slug) do update
  set is_active = excluded.is_active, name = excluded.name,
      latitude = excluded.latitude, longitude = excluded.longitude;

-- "Coming soon" reference data so the welcome screen can show inactive items
-- marked "(soon)" (§4). Inactive countries/cities are NOT selectable in the UI.
insert into public.countries (code, name, is_active, sort_order) values
  ('AE', 'United Arab Emirates', false, 10),
  ('ID', 'Indonesia',            false, 11),
  ('TH', 'Thailand',             false, 12)
on conflict (code) do nothing;

-- A couple more (inactive) Turkish cities to demonstrate the "(soon)" state.
insert into public.cities (country_id, slug, name, latitude, longitude, is_active, sort_order)
select c.id, v.slug, v.name, v.lat, v.lon, false, v.sort_order
from public.countries c
cross join (values
  ('antalya',  'Antalya',  36.8969, 30.7133, 1),
  ('istanbul', 'Istanbul', 41.0082, 28.9784, 2)
) as v(slug, name, lat, lon, sort_order)
where c.code = 'TR'
on conflict (country_id, slug) do nothing;
