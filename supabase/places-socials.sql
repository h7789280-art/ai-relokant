-- CityMate — social / web links for places (CLAUDE.md §5) — Stage 10
-- ============================================================================
-- Run this file manually in the Supabase SQL editor. Idempotent and safe to
-- re-run (ADD COLUMN IF NOT EXISTS).
--
-- Adds three optional contact fields to `places`, stored verbatim as entered by
-- the admin (an @handle or a full link). The app normalises them to clickable
-- profile URLs on display (see src/pages/Place.jsx):
--   * instagram → instagram.com/<username>
--   * telegram  → t.me/<username>
--   * website   → used as-is (https:// is prepended if missing)
-- ============================================================================

alter table public.places add column if not exists instagram text;
alter table public.places add column if not exists telegram  text;
alter table public.places add column if not exists website   text;
