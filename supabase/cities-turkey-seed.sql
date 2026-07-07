-- ============================================================================
-- CityMate — Turkey cities seed (CLAUDE.md §5 scoping) — Stage A (multi-city).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor. Idempotent and safe to
-- re-run. Adds the launch set of Turkish cities so users / the owner can scope
-- content to more than just Alanya. Does NOT weaken city scoping — every content
-- row still belongs to exactly one city.
--
-- HOW IT MATCHES BY COUNTRY
--   The country_id is looked up by code = 'TR' (a sub-select) — never a
--   hard-coded uuid — so this works on any environment.
--
-- ALANYA (the launch city) is intentionally NOT in this list and is left
-- untouched: it already exists (schema.sql seed) and needs no change.
--
-- WHY `do update` (not `do nothing`)
--   Antalya and Istanbul were already seeded by schema.sql but as INACTIVE
--   ("(soon)") demo rows. A `do nothing` would leave them inactive, contradicting
--   "all cities active" here. So on conflict we UPDATE: flip is_active = true and
--   refresh name / coordinates / sort_order. Brand-new cities are inserted. Since
--   Alanya isn't in the values list, it is never touched — no duplicate, no change.
-- ============================================================================

insert into public.cities (country_id, slug, name, latitude, longitude, is_active, sort_order)
select c.id, v.slug, v.name, v.lat, v.lon, true, v.sort_order
from public.countries c
cross join (values
  ('antalya',  'Antalya',  36.8969, 30.7133, 1),
  ('kemer',    'Kemer',    36.5983, 30.5595, 2),
  ('belek',    'Belek',    36.8625, 31.0556, 3),
  ('side',     'Side',     36.7673, 31.3890, 4),
  ('mersin',   'Mersin',   36.8121, 34.6415, 5),
  ('adana',    'Adana',    37.0000, 35.3213, 6),
  ('kas',      'Kaş',      36.2020, 29.6394, 7),
  ('izmir',    'İzmir',    38.4237, 27.1428, 8),
  ('istanbul', 'Istanbul', 41.0082, 28.9784, 9),
  ('bodrum',   'Bodrum',   37.0344, 27.4305, 10),
  ('marmaris', 'Marmaris', 36.8552, 28.2741, 11),
  ('ankara',   'Ankara',   39.9334, 32.8597, 12)
) as v(slug, name, lat, lon, sort_order)
where c.code = 'TR'
on conflict (country_id, slug) do update
  set is_active = excluded.is_active,
      name = excluded.name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      sort_order = excluded.sort_order;
