-- ============================================================================
-- CityMate — United Arab Emirates + Dubai seed (CLAUDE.md §5) — Stage A.
-- ============================================================================
-- Run this file manually in the Supabase SQL editor. Idempotent and safe to
-- re-run. Activates the UAE as a second country and adds Dubai as its launch
-- city, so the country switcher (profile) has a real cross-country option.
-- City scoping is unchanged: every content row still belongs to one city, and
-- the country boundary stays hard (Dubai content never leaks into Turkey).
--
-- WHY `do update` on the country
--   schema.sql already seeds 'AE' but as an INACTIVE ("(soon)") demo row. A
--   `do nothing` would leave it inactive; instead we UPDATE it to is_active =
--   true (and refresh the name / sort_order). Dubai is matched to AE by a
--   sub-select on code = 'AE' — never a hard-coded uuid.
-- ============================================================================

insert into public.countries (code, name, is_active, sort_order)
values ('AE', 'United Arab Emirates', true, 10)
on conflict (code) do update
  set is_active = excluded.is_active,
      name = excluded.name,
      sort_order = excluded.sort_order;

insert into public.cities (country_id, slug, name, latitude, longitude, is_active, sort_order)
select c.id, 'dubai', 'Dubai', 25.2048, 55.2708, true, 0
from public.countries c
where c.code = 'AE'
on conflict (country_id, slug) do update
  set is_active = excluded.is_active,
      name = excluded.name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      sort_order = excluded.sort_order;
