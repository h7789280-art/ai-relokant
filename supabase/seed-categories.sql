-- ============================================================================
-- CityMate — catalog category seed (CLAUDE.md §4.3, §5)
-- ============================================================================
-- A small starter set of catalog categories so the Catalog screen has structure
-- before any places exist. Reference data only — places are NOT seeded here.
--
-- Run manually in the Supabase SQL editor (after supabase/schema.sql). Safe to
-- re-run: upserts on the unique `slug`, so editing a name/icon/order and re-running
-- updates the row in place.
--
-- `icon` holds a lucide-react component name; keep these in sync with the
-- registry in src/lib/categoryIcons.js. The UI label comes from i18n
-- (catalog.categories.<slug>) and falls back to `name` below.
-- ============================================================================

insert into public.categories (slug, name, icon, is_active, sort_order) values
  ('doctors',    'Doctors',             'Stethoscope', true, 0),
  ('notaries',   'Notaries',            'Stamp',       true, 1),
  ('repair',     'Repairs',             'Wrench',      true, 2),
  ('shops',      'Shops',               'ShoppingBag', true, 3),
  ('pharmacies', 'Pharmacies',          'Pill',        true, 4),
  ('government', 'Government services', 'Landmark',    true, 5)
on conflict (slug) do update
  set name       = excluded.name,
      icon       = excluded.icon,
      is_active  = excluded.is_active,
      sort_order = excluded.sort_order;
