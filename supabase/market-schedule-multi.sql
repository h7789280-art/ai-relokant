-- ============================================================================
-- CityMate — allow SEVERAL markets on the same weekday (CLAUDE.md §4 screen 1)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER
-- supabase/market-schedule.sql. Idempotent and safe to re-run.
--
-- WHY THIS EXISTS
--   market-schedule.sql modelled ONE market per weekday via
--   unique (city_id, day_of_week). In Alanya a single weekday can host up to
--   THREE markets in different districts, so that constraint is too strict. This
--   drops it, letting the owner add multiple rows for the same day (each with its
--   own district / photo / hours / address / coordinates). Everything else about
--   the table — RLS, translations, the is_active flag — is unchanged.
--
-- DATA SAFETY
--   This only removes a CONSTRAINT; no rows are touched. The existing schedule
--   (Mon-Oba, Tue-Mahmutlar, …) is preserved verbatim. The non-unique lookup
--   index market_schedule_city_day_idx (city_id, day_of_week) stays in place and
--   still serves the "markets today" query.
-- ============================================================================

-- The inline `unique (city_id, day_of_week)` from market-schedule.sql is named
-- market_schedule_city_id_day_of_week_key by Postgres. Drop it if present.
alter table public.market_schedule
  drop constraint if exists market_schedule_city_id_day_of_week_key;
