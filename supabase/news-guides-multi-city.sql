-- ============================================================================
-- CityMate — Stage B: multi-city NEWS & GUIDES (CLAUDE.md §5, §7, §8).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql,
-- supabase/admin.sql and supabase/admin-content.sql. Idempotent and safe to
-- re-run.
--
-- WHAT CHANGES
--   One news item / guide may now be shown in SEVERAL cities of the SAME country
--   without duplicating the record. Places and events are untouched (a place /
--   event still belongs to exactly one city — §5).
--
-- HOW
--   Two dedicated many-to-many link tables — news_cities and guide_cities —
--   instead of one polymorphic table. Real foreign keys give us ON DELETE
--   CASCADE both ways (delete a news row → its links vanish; delete a city → its
--   stale links vanish), so — unlike content_translations, which has no FK and
--   must be hand-cleaned on every delete — there are no orphan links to sweep.
--
-- HARD COUNTRY BOUNDARY (§5)
--   A before-insert/update trigger on each link table refuses to attach a city
--   whose country differs from the country of any city ALREADY linked to that
--   record. So a news item / guide can never span two countries, whatever the
--   client sends. Dubai never sees a Turkish item because Dubai's city id is not
--   in that item's links.
--
-- MIGRATION (nothing is lost)
--   Every existing news / guide that has a city_id is linked to that SAME city in
--   the new table (one link). The "Изменения в ВНЖ" news item and any guides keep
--   their city. The backfill runs BEFORE the NOT NULL is dropped, while city_id
--   is still present, and is idempotent (on conflict do nothing).
--
-- THE OLD city_id COLUMN — KEPT, but NOT NULL is dropped.
--   The link tables are now the single source of truth for visibility. city_id is
--   left in place only for rollback / reference and is no longer written by the
--   admin UI; dropping its NOT NULL lets a multi-city row exist without a
--   meaningless "primary" city. (Its FK stays ON DELETE CASCADE; cities are
--   reference data and effectively never deleted.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Link tables
-- ----------------------------------------------------------------------------
create table if not exists public.news_cities (
  news_id  uuid not null references public.news(id)   on delete cascade,
  city_id  uuid not null references public.cities(id) on delete cascade,
  primary key (news_id, city_id)
);
create index if not exists news_cities_city_idx on public.news_cities (city_id);

create table if not exists public.guide_cities (
  guide_id uuid not null references public.guides(id)  on delete cascade,
  city_id  uuid not null references public.cities(id)  on delete cascade,
  primary key (guide_id, city_id)
);
create index if not exists guide_cities_city_idx on public.guide_cities (city_id);

-- ----------------------------------------------------------------------------
-- Same-country guard (§5). Each link's city must share the country of every
-- sibling link for that record. Raises on a mismatch — the hard boundary.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_news_cities_same_country()
returns trigger
language plpgsql
as $$
declare
  new_country   uuid;
  other_country uuid;
begin
  select country_id into new_country from public.cities where id = new.city_id;
  if new_country is null then
    raise exception 'news_cities: city % does not exist', new.city_id;
  end if;
  select c.country_id into other_country
    from public.news_cities nc
    join public.cities c on c.id = nc.city_id
    where nc.news_id = new.news_id
      and nc.city_id <> new.city_id
    limit 1;
  if other_country is not null and other_country <> new_country then
    raise exception
      'news_cities: all cities for one news item must be in the same country';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_guide_cities_same_country()
returns trigger
language plpgsql
as $$
declare
  new_country   uuid;
  other_country uuid;
begin
  select country_id into new_country from public.cities where id = new.city_id;
  if new_country is null then
    raise exception 'guide_cities: city % does not exist', new.city_id;
  end if;
  select c.country_id into other_country
    from public.guide_cities gc
    join public.cities c on c.id = gc.city_id
    where gc.guide_id = new.guide_id
      and gc.city_id <> new.city_id
    limit 1;
  if other_country is not null and other_country <> new_country then
    raise exception
      'guide_cities: all cities for one guide must be in the same country';
  end if;
  return new;
end;
$$;

drop trigger if exists news_cities_same_country on public.news_cities;
create trigger news_cities_same_country
  before insert or update on public.news_cities
  for each row execute function public.enforce_news_cities_same_country();

drop trigger if exists guide_cities_same_country on public.guide_cities;
create trigger guide_cities_same_country
  before insert or update on public.guide_cities
  for each row execute function public.enforce_guide_cities_same_country();

-- ----------------------------------------------------------------------------
-- Backfill from the existing single city_id (idempotent). MUST run while
-- city_id is still populated — i.e. before the NOT NULL drop below.
-- ----------------------------------------------------------------------------
insert into public.news_cities (news_id, city_id)
select id, city_id from public.news where city_id is not null
on conflict do nothing;

insert into public.guide_cities (guide_id, city_id)
select id, city_id from public.guides where city_id is not null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Relax the old NOT NULL (column kept for rollback/reference; see header).
-- ----------------------------------------------------------------------------
alter table public.news   alter column city_id drop not null;
alter table public.guides alter column city_id drop not null;

-- ----------------------------------------------------------------------------
-- Row Level Security (mirrors the content tables)
--   * Public: a link is readable only when its PARENT row is approved, so links
--     of pending/rejected items never leak (content_is_approved, schema.sql).
--   * Admins: full read + insert/delete (public.is_admin(), admin.sql).
--   No UPDATE policy — the app replaces links by delete+insert.
-- ----------------------------------------------------------------------------
alter table public.news_cities  enable row level security;
alter table public.guide_cities enable row level security;

-- news_cities -----------------------------------------------------------------
drop policy if exists "read approved news_cities" on public.news_cities;
create policy "read approved news_cities" on public.news_cities
  for select to anon, authenticated
  using (public.content_is_approved('news', news_id));

drop policy if exists "admins read all news_cities" on public.news_cities;
create policy "admins read all news_cities" on public.news_cities
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert news_cities" on public.news_cities;
create policy "admins insert news_cities" on public.news_cities
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete news_cities" on public.news_cities;
create policy "admins delete news_cities" on public.news_cities
  for delete to authenticated
  using (public.is_admin());

-- guide_cities ----------------------------------------------------------------
drop policy if exists "read approved guide_cities" on public.guide_cities;
create policy "read approved guide_cities" on public.guide_cities
  for select to anon, authenticated
  using (public.content_is_approved('guides', guide_id));

drop policy if exists "admins read all guide_cities" on public.guide_cities;
create policy "admins read all guide_cities" on public.guide_cities
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert guide_cities" on public.guide_cities;
create policy "admins insert guide_cities" on public.guide_cities
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete guide_cities" on public.guide_cities;
create policy "admins delete guide_cities" on public.guide_cities
  for delete to authenticated
  using (public.is_admin());

-- Table-level grants (RLS still applies on top).
grant select                 on public.news_cities,  public.guide_cities to anon, authenticated;
grant insert, delete         on public.news_cities,  public.guide_cities to authenticated;
