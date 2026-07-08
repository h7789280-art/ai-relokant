-- ============================================================================
-- CityMate — pasted GOOGLE MAPS LINK for places / events / markets
-- (CLAUDE.md §4, §5.8 — the "tap the address → route" helper).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor. Idempotent and safe to
-- re-run (ADD COLUMN IF NOT EXISTS). Touches no data.
--
-- WHY
--   In Turkey a textual address is often just a district ("Avsallar Mahallesi"
--   covers a whole neighbourhood), so routing by that address drops the user at
--   the district centre, not the actual door. The owner instead finds the exact
--   pin on Google Maps, hits Share → Copy link, and pastes that ready-made URL
--   here. The app then opens THIS link verbatim (short maps.app.goo.gl links
--   included) instead of rebuilding a route from the address/coordinates.
--
-- WHAT THIS ADDS
--   A nullable `maps_url` text column on the three location-bearing tables. It is
--   OPTIONAL — rows without it keep the old behaviour (route by coordinates, then
--   by address text). latitude/longitude stay untouched as the fallback.
--
-- PRIORITY at open time (see src/lib/maps.js directionsUrl):
--   1. maps_url (non-empty) → open exactly as stored, no rebuild;
--   2. else latitude/longitude → maps search by "<lat>,<lng>";
--   3. else address text (last resort).
--
-- SECURITY / RLS — UNCHANGED
--   The existing policies on these tables are ROW-level (public.is_admin() for
--   writes, approved/active for public reads). A new nullable column is covered
--   automatically — no policy change needed. `maps_url` is a plain URL, NOT
--   translated (§8), same as address/url/coordinates.
-- ============================================================================

alter table public.places          add column if not exists maps_url text;
alter table public.events          add column if not exists maps_url text;
alter table public.market_schedule add column if not exists maps_url text;
