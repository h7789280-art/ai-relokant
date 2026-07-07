-- ============================================================================
-- CityMate — Stage C (part 3): split VENUE city from WHERE-SHOWN (CLAUDE.md §4, §5).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql,
-- supabase/events-fields.sql, supabase/events-multi-city.sql (part 1) and
-- supabase/events-regional.sql (part 2). Idempotent and safe to re-run.
--
-- WHAT CHANGES (and WHY)
--   Until now an event had only the "where to show it" checkboxes (event_cities,
--   part 1) and the regional afisha measured proximity by THOSE checkboxes — so
--   everything checked for the user's own city landed at distance 0. The owner
--   wants proximity by the REAL place the event happens: a concert in Ankara is
--   FAR for an Alanya user, even if it is shown in Alanya.
--
--   So we split the two concepts:
--     * VENUE city (events.venue_city_id) — the ONE city where the event
--       physically takes place. Distance for the proximity sort is measured to
--       THIS city. Added here, nullable (old events may not have it yet).
--     * WHERE-SHOWN (event_cities, part 1) — the SET of cities the event appears
--       in. Curated by hand in the admin; the venue city is NOT auto-added to it.
--
--   VISIBILITY rule (deliberate): an event shows in city X's afisha ONLY if X is
--   among its where-shown checkboxes. If the venue city is not checked, the event
--   does NOT appear there — no implicit auto-add.
--
-- COUNTRY BOUNDARY (§5)
--   Visibility is airtight: the regional feed returns an event ONLY when the
--   user's OWN active city is among its where-shown checkboxes (see the RPC
--   below), and a city belongs to exactly one country — so a Dubai user can never
--   see a Turkish event, whatever the venue is. The venue↔checkboxes same-country
--   constraint is kept by the admin UI (both selectors are scoped to one country)
--   and the existing part-1 same-country trigger on event_cities. We deliberately
--   do NOT add a cross-table venue↔links DB trigger: because the admin writes the
--   event row (venue) and its links in two steps, such a trigger would deadlock a
--   legitimate country switch on edit (venue set to country B while the old
--   country-A links still exist). Visibility — not the sort distance — is the
--   boundary, and that is enforced above.
--
-- MIGRATION (nothing is lost)
--   Every event that still carries the legacy events.city_id but has no venue yet
--   gets venue_city_id := city_id (backfill). So pre-existing KASTA / Меладзе rows
--   keep a real venue for the proximity sort. Idempotent (only fills NULLs).
--
-- SECURITY / RLS
--   Unchanged. The RPC stays security invoker (caller's rights) so RLS still gates
--   rows to approved-only inside it; venue_city_id is a plain column on events and
--   inherits the table's existing policies. Cities are public reference data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The venue city — ONE city where the event physically happens. Nullable: old
-- events may not have it until edited/backfilled. ON DELETE SET NULL so removing
-- a city (reference data — effectively never happens) only drops the sort hint,
-- never the event.
-- ----------------------------------------------------------------------------
alter table public.events
  add column if not exists venue_city_id uuid references public.cities(id) on delete set null;

create index if not exists events_venue_city_idx on public.events (venue_city_id);

comment on column public.events.venue_city_id is
  'The single city where the event physically takes place. Distance for the '
  'regional-afisha proximity sort is measured to THIS city. Separate from the '
  'event_cities where-shown checkboxes (which control visibility).';

-- ----------------------------------------------------------------------------
-- Backfill from the legacy single city_id (idempotent — only fills the blanks).
-- Old events created before part 1 still carry city_id; give them a venue so the
-- proximity sort has a real place to measure from.
-- ----------------------------------------------------------------------------
update public.events
  set venue_city_id = city_id
  where venue_city_id is null
    and city_id is not null;

-- ----------------------------------------------------------------------------
-- events_by_country_proximity(p_city_id) — the regional afisha feed (REWRITTEN).
--   Returns the approved, NOT-past events SHOWN in p_city_id (i.e. p_city_id is
--   among the event's where-shown checkboxes), one row per event, ordered by the
--   proximity of the event's VENUE city to p_city_id, then by soonest date.
--
--   * VISIBILITY = p_city_id ∈ event_cities. This is also the hard country
--     boundary (§5): only events the owner checked for the user's own city come
--     back. (event_id, city_id) is unique, so the join yields at most one row per
--     event — no duplication, no group by needed.
--   * PROXIMITY = haversine from p_city_id to events.venue_city_id (the venue),
--     NOT the min over the where-shown checkboxes. A venue in the user's own city
--     is exactly 0 and leads; farther venues sort after; an event with no venue
--     (or a venue with no coordinates) yields NULL and sorts last (nulls last).
--   * "Not past" mirrors the client reader (src/lib/content.js): keep events whose
--     start OR end is today-or-later, plus undated events. "Today" is the start of
--     the day in Turkey wall-clock time (Europe/Istanbul, UTC+3), so the feed
--     doesn't flip a few hours early/late for users in other timezones.
-- ----------------------------------------------------------------------------
create or replace function public.events_by_country_proximity(p_city_id uuid)
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
    order by
      -- Distance to the VENUE city: own-city venue = 0 and leads; farther venues
      -- after; missing venue/coordinates → NULL sorts last.
      public.haversine_km(me_lat, me_lon, vc.latitude, vc.longitude) asc nulls last,
      -- Within the same proximity, soonest first; undated last.
      e.starts_at asc nulls last,
      -- Deterministic tie-break so equal-distance, equal-date events keep a stable
      -- order across reloads (id is always present).
      e.id asc;
end;
$$;

-- Callable by the public app (RLS still gates the rows it can see, see header).
grant execute on function public.events_by_country_proximity(uuid)
  to anon, authenticated;
