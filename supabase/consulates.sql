-- ============================================================================
-- CityMate — consulates directory for the SOS screen (CLAUDE.md §4, §5, §11)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql
-- (defines countries + set_updated_at) and supabase/admin.sql (defines
-- public.is_admin()). Idempotent and safe to re-run.
--
-- WHY THIS EXISTS
--   The SOS screen shows "my consulate": the mission of the user's CITIZENSHIP
--   country that operates in the country they are currently in. Losing a
--   passport abroad is exactly the moment nobody can search for a phone number,
--   so the 24/7 emergency line has to be one tap away.
--
--   Like market_schedule (§5.7) this is REFERENCE data the owner maintains by
--   hand from official mission websites — NOT a moderation queue. Hence an
--   `is_active` flag instead of status/source, and `verified_at` to record when
--   the owner last checked the numbers against the official site (§11 — a stale
--   emergency number is worse than none).
--
--   NOTHING IS SEEDED HERE ON PURPOSE. Phone numbers must never be guessed or
--   filled with placeholders — the owner enters every row from the official
--   source through the admin panel.
--
-- TWO DIFFERENT COUNTRIES (read this before changing the columns)
--   citizenship_country_code — the country whose citizens the mission serves
--     (e.g. 'RU' for the Russian consulate). A plain ISO alpha-2 CODE and
--     deliberately NOT a FK to public.countries: countries only lists the
--     countries the APP covers (Turkey, UAE, …), while citizenship can be any
--     country on earth. Matching is by code, against the user's profile setting.
--   host_country_id — the app country the mission operates IN (FK to countries).
--     This keeps the hard country boundary (§5.4): a user in Turkey only ever
--     sees missions located in Turkey.
-- ============================================================================

create table if not exists public.consulates (
  id                        uuid primary key default gen_random_uuid(),
  -- Whose citizens it serves — ISO-3166 alpha-2, uppercase (not a FK, see above).
  citizenship_country_code  text not null check (citizenship_country_code ~ '^[A-Z]{2}$'),
  -- Where it operates — the app country (hard boundary, §5.4).
  host_country_id           uuid not null references public.countries(id) on delete cascade,
  name                      text not null,       -- e.g. "Consulate General of Russia"
  city_label                text,                -- e.g. "Antalya" — shown as "consulate in Antalya"
  emergency_phone           text,                -- THE 24/7 line — the main field of this table
  phone                     text,                -- ordinary daytime line
  hours                     text,                -- free text, not translated (§8)
  address                   text,                -- not translated (§8)
  maps_url                  text,                -- ready-made maps link, wins over coords (§5.8)
  latitude                  double precision,    -- fallback for the route link
  longitude                 double precision,
  website                   text,
  verified_at               timestamptz,         -- when the owner last checked the numbers (§11)
  is_active                 boolean not null default true,
  sort_order                integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- The SOS lookup is always (host country + citizenship), so index that pair.
create index if not exists consulates_host_citizenship_idx
  on public.consulates (host_country_id, citizenship_country_code);

-- Keep updated_at fresh on edits (same helper the other tables use).
drop trigger if exists set_updated_at on public.consulates;
create trigger set_updated_at before update on public.consulates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — mirrors market_schedule:
--   public (anon + authenticated): read ACTIVE rows only;
--   admins (public.is_admin()): read any row + full write.
-- ----------------------------------------------------------------------------
alter table public.consulates enable row level security;

drop policy if exists "read active consulates" on public.consulates;
create policy "read active consulates" on public.consulates
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists "admins read all consulates" on public.consulates;
create policy "admins read all consulates" on public.consulates
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert consulates" on public.consulates;
create policy "admins insert consulates" on public.consulates
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update consulates" on public.consulates;
create policy "admins update consulates" on public.consulates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete consulates" on public.consulates;
create policy "admins delete consulates" on public.consulates
  for delete to authenticated
  using (public.is_admin());

-- Table-level grants (RLS still applies on top).
grant select on public.consulates to anon, authenticated;
grant insert, update, delete on public.consulates to authenticated;

-- ============================================================================
-- NOTE ON TRANSLATIONS (§8)
--   Consulate rows are deliberately NOT wired into content_translations. Every
--   field here is either a proper noun (the mission's official name), a phone,
--   an address, a URL or free-form hours — none of which are translated
--   anywhere else in the app either. The screen's own labels come from i18n.
-- ============================================================================
