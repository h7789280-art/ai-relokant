-- ============================================================================
-- CityMate — catalog category tree seed (CLAUDE.md §4.3, §5)
-- ============================================================================
-- The full Catalog tree: 10 top categories, each with subcategories. Reference
-- data only — places are NOT seeded here.
--
-- Run manually in the Supabase SQL editor (after supabase/schema.sql). Fully
-- idempotent and safe to re-run: it first removes any categories/subcategories
-- that are no longer in this file (including the old flat set and the dropped
-- "Government services" category), then upserts the current tree by slug so
-- existing ids survive re-runs.
--
-- `icon` holds a lucide-react component name; keep these in sync with the
-- registry in src/lib/categoryIcons.js. UI labels come from i18n
-- (catalog.categories.<slug> / catalog.subcategories.<slug>) and fall back to
-- the English `name` columns below.
-- ============================================================================

-- 1) Drop categories no longer in the tree (the old flat set + "government").
--    Cascades to their subcategories.
delete from public.categories
where slug not in (
  'health', 'documents', 'home', 'shops', 'food',
  'transport', 'kids', 'leisure', 'realestate', 'pets'
);

-- 2) Upsert the 10 top categories (ids preserved across re-runs via slug).
insert into public.categories (slug, name, icon, is_active, sort_order) values
  ('health',     'Health',        'Stethoscope', true, 0),
  ('documents',  'Documents',     'FileText',    true, 1),
  ('home',       'Home & living', 'Wrench',      true, 2),
  ('shops',      'Shops',         'ShoppingBag', true, 3),
  ('food',       'Food',          'Utensils',    true, 4),
  ('transport',  'Transport',     'Bus',         true, 5),
  ('kids',       'Kids',          'Baby',        true, 6),
  ('leisure',    'Leisure',       'Palmtree',    true, 7),
  ('realestate', 'Real estate',   'Building2',   true, 8),
  ('pets',       'Pets',          'PawPrint',    true, 9)
on conflict (slug) do update
  set name       = excluded.name,
      icon       = excluded.icon,
      is_active  = excluded.is_active,
      sort_order = excluded.sort_order;

-- 3) Subcategories. Staged in a temp table so the one list drives both the
--    cleanup of stale rows and the upsert (ids preserved via (category, slug)).
drop table if exists _seed_subcategories;
create temporary table _seed_subcategories (
  cat_slug   text    not null,
  slug       text    not null,
  name       text    not null,
  sort_order integer not null
);

insert into _seed_subcategories (cat_slug, slug, name, sort_order) values
  -- Health
  ('health', 'doctors',    'Doctors',    0),
  ('health', 'dentists',   'Dentists',   1),
  ('health', 'pharmacies', 'Pharmacies', 2),
  ('health', 'hospitals',  'Hospitals',  3),
  ('health', 'lab-tests',  'Lab tests',  4),
  -- Documents
  ('documents', 'notaries',         'Notaries',         0),
  ('documents', 'translators',      'Translators',      1),
  ('documents', 'lawyers',          'Lawyers',          2),
  ('documents', 'attorneys',        'Attorneys',        3),
  ('documents', 'residence-permit', 'Residence permit', 4),
  ('documents', 'numarataj',        'Numarataj',        5),
  ('documents', 'insurance',        'Insurance',        6),
  -- Home & living
  ('home', 'repair',          'Repairs',         0),
  ('home', 'cleaning',        'Cleaning',        1),
  ('home', 'furniture',       'Furniture',       2),
  ('home', 'building-stores', 'Building stores', 3),
  ('home', 'electricians',    'Electricians',    4),
  ('home', 'plumbers',        'Plumbers',        5),
  -- Shops
  ('shops', 'groceries',  'Groceries',  0),
  ('shops', 'malls',      'Malls',      1),
  ('shops', 'clothing',   'Clothing',   2),
  ('shops', 'home-goods', 'Home goods', 3),
  ('shops', 'fabrics',    'Fabrics',    4),
  ('shops', 'yarn',       'Yarn',       5),
  ('shops', 'flowers',    'Flowers',    6),
  -- Food
  ('food', 'restaurants',  'Restaurants',  0),
  ('food', 'cafes',        'Cafés',        1),
  ('food', 'delivery',     'Delivery',     2),
  ('food', 'patisseries',  'Patisseries',  3),
  ('food', 'custom-cakes', 'Custom cakes', 4),
  -- Transport
  ('transport', 'taxi',        'Taxi',        0),
  ('transport', 'transfer',    'Transfer',    1),
  ('transport', 'car-rental',  'Car rental',  2),
  ('transport', 'car-service', 'Car service', 3),
  -- Kids
  ('kids', 'schools',       'Schools',        0),
  ('kids', 'kindergartens', 'Kindergartens',  1),
  ('kids', 'clubs',         'Clubs',          2),
  ('kids', 'kids-centers',  'Kids'' centers', 3),
  -- Leisure
  ('leisure', 'beaches',     'Beaches',     0),
  ('leisure', 'attractions', 'Attractions', 1),
  ('leisure', 'excursions',  'Excursions',  2),
  ('leisure', 'parks',       'Parks',       3),
  ('leisure', 'routes',      'Routes',      4),
  -- Real estate
  ('realestate', 'rent',      'Rent',           0),
  ('realestate', 'buy',       'Buy',            1),
  ('realestate', 'agencies',  'Agencies',       2),
  ('realestate', 'districts', 'City districts', 3),
  -- Pets
  ('pets', 'vet-clinics',   'Vet clinics',  0),
  ('pets', 'pet-supplies',  'Pet supplies', 1),
  ('pets', 'pet-insurance', 'Insurance',    2);

-- Remove subcategories that are no longer in the tree.
delete from public.subcategories s
using public.categories c
where s.category_id = c.id
  and not exists (
    select 1 from _seed_subcategories t
    where t.cat_slug = c.slug and t.slug = s.slug
  );

-- Upsert the subcategories (ids preserved across re-runs via (category, slug)).
insert into public.subcategories (category_id, slug, name, is_active, sort_order)
select c.id, t.slug, t.name, true, t.sort_order
from _seed_subcategories t
join public.categories c on c.slug = t.cat_slug
on conflict (category_id, slug) do update
  set name       = excluded.name,
      is_active  = excluded.is_active,
      sort_order = excluded.sort_order;

drop table if exists _seed_subcategories;
