-- ============================================================================
-- CityMate — Stage C (part 4): optional DATE-RANGE filter for the regional
-- afisha (CLAUDE.md §4, §5).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql,
-- supabase/events-fields.sql, supabase/events-multi-city.sql (part 1),
-- supabase/events-regional.sql (part 2) and supabase/events-venue-city.sql
-- (part 3). Idempotent and safe to re-run.
--
-- WHAT CHANGES (and WHY)
--   The Events screen gains a date-filter ribbon (Today / Weekend / This week /
--   This month / custom range) next to the city ribbon. The client computes the
--   period edges in Turkey time and passes them here as two absolute instants.
--   This RPC gains two OPTIONAL parameters, p_from / p_to, that narrow the feed
--   to events overlapping [p_from, p_to] — WITHOUT touching the visibility,
--   country boundary, proximity or ordering established in parts 2–3.
--
--   Both default to NULL, so every existing caller (the Home rail, the Events
--   "All dates" default) keeps working unchanged: NULL bounds ⇒ no narrowing.
--
-- SIGNATURE CHANGE
--   Part 3 defined events_by_country_proximity(uuid). Postgres can't add
--   defaulted params to an existing function via CREATE OR REPLACE (the argument
--   list differs), so we DROP the 1-arg version and CREATE the 3-arg one whose
--   extra params default to NULL. PostgREST then resolves the old 1-arg RPC call
--   ({p_city_id}) to this function via the defaults — no ambiguity, since only
--   one function of this name now exists.
--
-- OVERLAP + UNDATED (matches the client reader, src/lib/content.js)
--   * A dated event overlaps the window when it STARTS on/before p_to AND its END
--     (or its start, for a single-day event: coalesce(ends_at, starts_at)) is
--     on/after p_from. This is the same rule fetchUpcomingEvents applies for the
--     single-city agenda, kept in lock-step.
--   * While a filter is active (either bound set) UNDATED events are hidden — they
--     have no date to fall inside a period. With no filter (both NULL) they show,
--     exactly as before.
--   * p_from is already clamped to "today" by the client, but the existing
--     not-past cutoff below still applies independently — a date filter can never
--     surface past events.
--
-- SECURITY / RLS
--   Unchanged from part 3. Still STABLE, still security invoker, so RLS keeps
--   gating rows to approved-only; the new params are plain filter inputs.
-- ============================================================================

-- Drop the part-3 signature so we can widen it with two defaulted params.
drop function if exists public.events_by_country_proximity(uuid);

create or replace function public.events_by_country_proximity(
  p_city_id uuid,
  p_from    timestamptz default null,
  p_to      timestamptz default null
)
returns setof public.events
language plpgsql
stable
as $$
declare
  me_lat double precision;
  me_lon double precision;
  -- Start of today in Turkey wall-clock time, as an absolute instant.
  cutoff timestamptz :=
    date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
begin
  select latitude, longitude
    into me_lat, me_lon
    from public.cities
    where id = p_city_id;

  -- Unknown city → nothing to show (mirrors the client's "no city, no content").
  if not found then
    return;
  end if;

  return query
    select e.*
    from public.events e
    -- VISIBILITY + hard country boundary: the user's OWN city must be a
    -- where-shown checkbox of the event. Exactly one matching link per event.
    join public.event_cities ec
      on ec.event_id = e.id and ec.city_id = p_city_id
    -- The venue city, for the proximity sort only. LEFT JOIN so a venue-less event
    -- still comes back (it just sorts last).
    left join public.cities vc on vc.id = e.venue_city_id
    where e.status = 'approved'
      and (
        e.starts_at is null
        or e.starts_at >= cutoff
        or e.ends_at   >= cutoff
      )
      -- Optional DATE FILTER. When neither bound is set, this passes everything
      -- through (undated included). When either bound is set, keep only DATED
      -- events overlapping [p_from, p_to]; undated ones drop out.
      and (
        (p_from is null and p_to is null)
        or (
          e.starts_at is not null
          and (p_from is null or coalesce(e.ends_at, e.starts_at) >= p_from)
          and (p_to   is null or e.starts_at <= p_to)
        )
      )
    order by
      -- PRIMARY key: soonest date first; undated events sort last. All events of
      -- the same date group together (e.g. all of July 9 before any of July 10).
      e.starts_at asc nulls last,
      -- SECONDARY key: WITHIN the same date, closer venue first. Distance to the
      -- VENUE city: own-city venue = 0 and leads; farther venues after; missing
      -- venue/coordinates → NULL sorts last.
      public.haversine_km(me_lat, me_lon, vc.latitude, vc.longitude) asc nulls last,
      -- Deterministic tie-break so equal-date, equal-distance events keep a stable
      -- order across reloads (id is always present).
      e.id asc;
end;
$$;

-- Callable by the public app (RLS still gates the rows it can see, see header).
grant execute on function public.events_by_country_proximity(uuid, timestamptz, timestamptz)
  to anon, authenticated;
