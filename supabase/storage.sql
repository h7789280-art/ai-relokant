-- CityMate — photo storage for places (CLAUDE.md §5, §7) — Stage 10
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/admin.sql
-- (it depends on public.is_admin()). Idempotent and safe to re-run.
--
-- What this sets up:
--   * A PUBLIC storage bucket `place-photos` for place/service images, so the
--     public URLs work without a signed token (the app stores the URL in
--     places.photos and renders it directly).
--   * RLS on storage.objects scoped to this bucket:
--       - public read (SELECT) for anyone — the photos are meant to be shown;
--       - write (INSERT / UPDATE / DELETE) only for admins (public.is_admin()),
--         matching how only admins can write to `places`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- place-photos — public bucket for place images.
-- created via storage.buckets so the operation is plain SQL and idempotent.
-- `public = true` makes object URLs readable without a token.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do update set public = true;

-- ----------------------------------------------------------------------------
-- storage.objects policies, scoped to the place-photos bucket.
-- RLS is already enabled on storage.objects by Supabase; we just add policies.
-- ----------------------------------------------------------------------------

-- Public read: anyone (anon + authenticated) may read objects in this bucket.
drop policy if exists "place-photos public read" on storage.objects;
create policy "place-photos public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'place-photos');

-- Admins: upload new photos.
drop policy if exists "place-photos admin insert" on storage.objects;
create policy "place-photos admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'place-photos' and public.is_admin());

-- Admins: replace existing photos.
drop policy if exists "place-photos admin update" on storage.objects;
create policy "place-photos admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'place-photos' and public.is_admin())
  with check (bucket_id = 'place-photos' and public.is_admin());

-- Admins: delete photos.
drop policy if exists "place-photos admin delete" on storage.objects;
create policy "place-photos admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'place-photos' and public.is_admin());
-- ============================================================================
