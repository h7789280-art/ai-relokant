-- ============================================================================
-- CityMate — Stage C (part 1): multi-city EVENTS (CLAUDE.md §5, §7, §8).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql,
-- supabase/admin.sql, supabase/admin-content.sql and supabase/events-fields.sql.
-- Idempotent and safe to re-run.
--
-- WHAT CHANGES
--   An event may now be shown in SEVERAL cities of the SAME country without
--   duplicating the record — exactly like news / guides in Stage B. Places are
--   untouched (a place still belongs to exactly one city — §5).
--
-- HOW
--   A dedicated many-to-many link table — event_cities — modelled on news_cities.
--   Real foreign keys give us ON DELETE CASCADE both ways (delete an event → its
--   links vanish; delete a city → its stale links vanish), so there are no orphan
--   links to sweep.
--
-- HARD COUNTRY BOUNDARY (§5)
--   A before-insert/update trigger refuses to attach a city whose country differs
--   from the country of any city ALREADY linked to that event. So an event can
--   never span two countries, whatever the client sends. Dubai never sees a
--   Turkish event because Dubai's city id is not in that event's links.
--
-- MIGRATION (nothing is lost)
--   Every existing event that has a city_id is linked to that SAME city in the new
--   table (one link). KASTA, Меладзе and any other events keep their city. The
--   backfill runs BEFORE the NOT NULL is dropped, while city_id is still present,
--   and is idempotent (on conflict do nothing).
--
-- THE OLD city_id COLUMN — KEPT, but NOT NULL is dropped.
--   The link table is now the single source of truth for visibility. city_id is
--   left in place only for rollback / reference and is no longer written by the
--   admin UI; dropping its NOT NULL lets a multi-city event exist without a
--   meaningless "primary" city. (Its FK stays ON DELETE CASCADE; cities are
--   reference data and effectively never deleted.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Link table
-- ----------------------------------------------------------------------------
create table if not exists public.event_cities (
  event_id uuid not null references public.events(id) on delete cascade,
  city_id  uuid not null references public.cities(id) on delete cascade,
  primary key (event_id, city_id)
);
create index if not exists event_cities_city_idx on public.event_cities (city_id);

-- ----------------------------------------------------------------------------
-- Same-country guard (§5). Each link's city must share the country of every
-- sibling link for that event. Raises on a mismatch — the hard boundary.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_event_cities_same_country()
returns trigger
language plpgsql
as $$
declare
  new_country   uuid;
  other_country uuid;
begin
  select country_id into new_country from public.cities where id = new.city_id;
  if new_country is null then
    raise exception 'event_cities: city % does not exist', new.city_id;
  end if;
  select c.country_id into other_country
    from public.event_cities ec
    join public.cities c on c.id = ec.city_id
    where ec.event_id = new.event_id
      and ec.city_id <> new.city_id
    limit 1;
  if other_country is not null and other_country <> new_country then
    raise exception
      'event_cities: all cities for one event must be in the same country';
  end if;
  return new;
end;
$$;

drop trigger if exists event_cities_same_country on public.event_cities;
create trigger event_cities_same_country
  before insert or update on public.event_cities
  for each row execute function public.enforce_event_cities_same_country();

-- ----------------------------------------------------------------------------
-- Backfill from the existing single city_id (idempotent). MUST run while
-- city_id is still populated — i.e. before the NOT NULL drop below.
-- ----------------------------------------------------------------------------
insert into public.event_cities (event_id, city_id)
select id, city_id from public.events where city_id is not null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Relax the old NOT NULL (column kept for rollback/reference; see header).
-- ----------------------------------------------------------------------------
alter table public.events alter column city_id drop not null;

-- ----------------------------------------------------------------------------
-- Row Level Security (mirrors news_cities)
--   * Public: a link is readable only when its PARENT event is approved, so links
--     of pending/rejected events never leak (content_is_approved, schema.sql).
--   * Admins: full read + insert/delete (public.is_admin(), admin.sql).
--   No UPDATE policy — the app replaces links by delete+insert.
-- ----------------------------------------------------------------------------
alter table public.event_cities enable row level security;

drop policy if exists "read approved event_cities" on public.event_cities;
create policy "read approved event_cities" on public.event_cities
  for select to anon, authenticated
  using (public.content_is_approved('events', event_id));

drop policy if exists "admins read all event_cities" on public.event_cities;
create policy "admins read all event_cities" on public.event_cities
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert event_cities" on public.event_cities;
create policy "admins insert event_cities" on public.event_cities
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete event_cities" on public.event_cities;
create policy "admins delete event_cities" on public.event_cities
  for delete to authenticated
  using (public.is_admin());

-- Table-level grants (RLS still applies on top).
grant select         on public.event_cities to anon, authenticated;
grant insert, delete on public.event_cities to authenticated;
