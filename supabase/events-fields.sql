-- ============================================================================
-- CityMate — extra fields for EVENTS / afisha (CLAUDE.md §4 screen 5, §5)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor. Idempotent and safe to
-- re-run (ADD COLUMN IF NOT EXISTS). Touches no data.
--
-- WHAT THIS ADDS
--   Socials, a guest "gathering" time, and ticket pricing to `events`. Every
--   column is NULLABLE — existing events (which have none of these) keep working
--   untouched, and the app hides any field left empty.
--
-- SCOPING — UNCHANGED
--   Events stay city-scoped (city_id NOT NULL, set in schema.sql). Regional /
--   cross-city afisha is a separate future task and is intentionally NOT done
--   here. Moderation (status/source/verified_at) and translations are unchanged.
-- ============================================================================

-- Social / contact links — stored verbatim as the admin typed them (an @handle
-- or a full link), same meaning as the matching columns on `places`. The app
-- normalises them to clickable URLs on display (see src/pages/Event.jsx):
--   * instagram → instagram.com/<handle>
--   * telegram  → t.me/<handle>
--   * whatsapp  → wa.me/<digits>
alter table public.events add column if not exists instagram text;
alter table public.events add column if not exists telegram  text;
alter table public.events add column if not exists whatsapp  text;

-- Guest gathering / "doors" time — when people are asked to arrive, BEFORE the
-- event proper begins. Distinct from starts_at (begin) and ends_at (finish).
-- Same type as starts_at so the admin uses the same datetime picker.
alter table public.events add column if not exists gathering_at timestamptz;

-- Ticket price — three mutually exclusive modes selected by price_type:
--   * 'paid'    → a price_from .. price_to range (either bound may be null)
--   * 'free'    → no amounts needed
--   * 'deposit' → a single price_deposit that is applied to the order
-- price_type stays nullable: an event with no ticketing info leaves it unset and
-- the app shows nothing. The check keeps the three modes honest without blocking
-- a future 4th mode being added here.
alter table public.events
  add column if not exists price_type text
  check (price_type in ('paid', 'free', 'deposit'));

alter table public.events add column if not exists price_from    numeric;
alter table public.events add column if not exists price_to      numeric;
alter table public.events add column if not exists price_deposit numeric;

-- Currency as a plain code (default TRY at launch) rather than an enum, so the
-- list can grow past TRY/EUR/USD later without a schema migration. The UI offers
-- the launch set; any code stored here is shown as-is with its symbol.
alter table public.events add column if not exists price_currency text default 'TRY';
