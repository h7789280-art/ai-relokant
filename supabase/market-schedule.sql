-- ============================================================================
-- CityMate — weekly market schedule (CLAUDE.md §4 screen 1, §5, §8)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql
-- (defines cities + content_translations + content_is_approved) and
-- supabase/admin.sql (defines public.is_admin()). Idempotent and safe to re-run.
--
-- WHY THIS EXISTS
--   Markets in Alanya rotate weekly — a different district each weekday (Mon Oba,
--   Tue Mahmutlar, Wed Center, …). Instead of the owner creating/deleting a
--   "market" place every day, the schedule is set ONCE here; the Home "Markets
--   today" rail then shows the row for the CURRENT weekday (Turkey time) on its
--   own. This is reference-style, owner-only data — NOT a moderation queue — so
--   it carries an `is_active` flag rather than the status/source/verified_at that
--   moderated content uses. A day left inactive (e.g. Sunday) simply shows no
--   market.
--
-- DAY ENCODING
--   day_of_week uses ISO-8601: 1 = Monday, 2 = Tuesday, … 7 = Sunday. The week
--   starts on Monday (owner's schedule order). Keep this in sync with the client:
--   src/lib/content.js turkeyDayOfWeek() and src/pages/Admin.jsx DAYS.
-- ============================================================================

create table if not exists public.market_schedule (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 1 and 7), -- 1=Mon … 7=Sun
  name         text not null,                    -- district / market name (base, translatable)
  image_url    text,
  hours        text,                             -- e.g. "08:00–18:00" (not translated)
  address      text,                             -- not translated (§8)
  latitude     double precision,                 -- optional, for a "Route" link
  longitude    double precision,
  is_active    boolean not null default true,    -- false => that weekday shows no market
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One market per weekday per city, so the schedule upserts cleanly by day.
  unique (city_id, day_of_week)
);
create index if not exists market_schedule_city_day_idx
  on public.market_schedule (city_id, day_of_week);

-- Keep updated_at fresh on edits (same helper the moderated tables use).
drop trigger if exists set_updated_at on public.market_schedule;
create trigger set_updated_at before update on public.market_schedule
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — mirrors the other tables:
--   public (anon + authenticated): read ACTIVE rows only;
--   admins (public.is_admin()): read any row + full write.
-- ----------------------------------------------------------------------------
alter table public.market_schedule enable row level security;

drop policy if exists "read active market_schedule" on public.market_schedule;
create policy "read active market_schedule" on public.market_schedule
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists "admins read all market_schedule" on public.market_schedule;
create policy "admins read all market_schedule" on public.market_schedule
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert market_schedule" on public.market_schedule;
create policy "admins insert market_schedule" on public.market_schedule
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update market_schedule" on public.market_schedule;
create policy "admins update market_schedule" on public.market_schedule
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete market_schedule" on public.market_schedule;
create policy "admins delete market_schedule" on public.market_schedule
  for delete to authenticated
  using (public.is_admin());

-- Table-level grants (RLS still applies on top).
grant select on public.market_schedule to anon, authenticated;
grant insert, update, delete on public.market_schedule to authenticated;

-- ============================================================================
-- Multilingual district names via the shared content_translations table (§8).
--   The district/market name may need translating (the same auto-translate flow
--   as places/news). Hours/address are not translated. We extend two things the
--   schema defined:
--     1) the entity_type CHECK, to allow 'market_schedule';
--     2) content_is_approved(), so the PUBLIC translation-read policy exposes a
--        schedule row's translations exactly when that row is ACTIVE (there is no
--        `status` here — "active" is this table's notion of "published").
-- ============================================================================

-- 1) Allow 'market_schedule' as a translation entity_type. The inline CHECK from
--    schema.sql is named content_translations_entity_type_check; drop & re-add.
alter table public.content_translations
  drop constraint if exists content_translations_entity_type_check;
alter table public.content_translations
  add constraint content_translations_entity_type_check
  check (entity_type in ('places','events','guides','news','ads','market_schedule'));

-- 2) Teach content_is_approved() about market_schedule (active == publicly visible).
--    Redefining the function is safe & idempotent (create or replace). All the
--    existing branches are preserved verbatim.
create or replace function public.content_is_approved(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_entity_type
    when 'places'          then exists (select 1 from public.places           where id = p_entity_id and status = 'approved')
    when 'events'          then exists (select 1 from public.events           where id = p_entity_id and status = 'approved')
    when 'guides'          then exists (select 1 from public.guides           where id = p_entity_id and status = 'approved')
    when 'news'            then exists (select 1 from public.news             where id = p_entity_id and status = 'approved')
    when 'ads'             then exists (select 1 from public.ads              where id = p_entity_id and status = 'approved')
    when 'market_schedule' then exists (select 1 from public.market_schedule  where id = p_entity_id and is_active = true)
    else false
  end;
$$;
-- ============================================================================
