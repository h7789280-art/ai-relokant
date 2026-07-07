-- ============================================================================
-- CityMate — Stage C (part 2): REGIONAL afisha by PROXIMITY (CLAUDE.md §4, §5).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql,
-- supabase/events-fields.sql and supabase/events-multi-city.sql (part 1).
-- Idempotent and safe to re-run.
--
-- WHAT CHANGES
--   The afisha stops being strictly city-scoped and becomes REGIONAL: it shows
--   every upcoming event of the user's COUNTRY, sorted by how close the event's
--   city is to the user's active city (own city first, then nearer → farther).
--   Only the afisha changes — places and news stay city-scoped (§5).
--
-- WHY SERVER-SIDE
--   Distance is computed here in Postgres (not in the browser) so the ordering is
--   consistent for everyone and phones don't crunch haversine over the whole feed.
--   The proximity of a MULTI-CITY event is the MINIMUM distance from the user's
--   city to any of the event's linked cities (§ requirement).
--
-- HARD COUNTRY BOUNDARY (§5)
--   Only events linked to a city in the SAME country as the user's active city are
--   returned. Dubai never sees a Turkish event. The link table (event_cities) plus
--   the same-country trigger (part 1) already guarantee an event lives in exactly
--   one country; here we additionally filter by that country.
--
-- SECURITY / RLS
--   security invoker (the default) — the function runs with the CALLER's rights,
--   so the existing Row Level Security still applies inside it: only approved
--   events, only links whose parent event is approved, cities are public. Nothing
--   pending/rejected can leak. No SECURITY DEFINER, no RLS bypass.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Great-circle distance in kilometres (haversine). IMMUTABLE — depends only on
-- its args. NULL-safe: any missing coordinate yields NULL, which sorts last and
-- is ignored by min() (so an event keeps the distance of its coordinated cities).
-- ----------------------------------------------------------------------------
create or replace function public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 2 * 6371 * asin(least(1, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lon2 - lon1) / 2), 2)
    )))
  end;
$$;

-- ----------------------------------------------------------------------------
-- events_by_country_proximity(p_city_id) — the regional afisha feed.
--   Returns the approved, NOT-past events of p_city_id's country, one row per
--   event, ordered by proximity of the event to p_city_id, then by soonest date.
--
--   * "Not past" mirrors the client reader (src/lib/content.js): keep events
--     whose start OR end is today-or-later, plus undated events. "Today" is the
--     start of the day in Turkey wall-clock time (Europe/Istanbul, UTC+3), so the
--     feed doesn't flip a few hours early/late for users in other timezones.
--   * Proximity = MIN distance from p_city_id to any linked city (own city = 0).
--   * group by e.id collapses a multi-city event to a single row (no duplication).
-- ----------------------------------------------------------------------------
create or replace function public.events_by_country_proximity(p_city_id uuid)
returns setof public.events
language plpgsql
stable
as $$
declare
  me_country uuid;
  me_lat     double precision;
  me_lon     double precision;
  -- Start of today in Turkey wall-clock time, as an absolute instant.
  cutoff timestamptz :=
    date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
begin
  select country_id, latitude, longitude
    into me_country, me_lat, me_lon
    from public.cities
    where id = p_city_id;

  -- Unknown city → nothing to show (mirrors the client's "no city, no content").
  if me_country is null then
    return;
  end if;

  return query
    select e.*
    from public.events e
    join public.event_cities ec on ec.event_id = e.id
    join public.cities c        on c.id = ec.city_id
    where e.status = 'approved'
      and c.country_id = me_country
      and (
        e.starts_at is null
        or e.starts_at >= cutoff
        or e.ends_at   >= cutoff
      )
    group by e.id
    order by
      -- Own city is exactly 0 and leads; other cities by real distance; a city
      -- with no coordinates yields NULL and sorts last (nulls last).
      min(
        case
          when c.id = p_city_id then 0
          else public.haversine_km(me_lat, me_lon, c.latitude, c.longitude)
        end
      ) asc nulls last,
      -- Within the same proximity, soonest first; undated last.
      min(e.starts_at) asc nulls last;
end;
$$;

-- Callable by the public app (RLS still gates the rows it can see, see header).
grant execute on function public.haversine_km(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
grant execute on function public.events_by_country_proximity(uuid)
  to anon, authenticated;
