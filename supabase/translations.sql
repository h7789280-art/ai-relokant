-- ============================================================================
-- CityMate — content translations: admin WRITE access (CLAUDE.md §5, §7, §8)
-- Stage 11D. Run this file manually in the Supabase SQL editor, AFTER
-- supabase/schema.sql (defines the table + public read) and supabase/admin.sql
-- (defines public.is_admin()). Idempotent and safe to re-run.
--
-- WHY THIS FILE EXISTS
--   schema.sql already creates `public.content_translations` (the §8 linked
--   translations table: key = entity_type / entity_id / lang / field, value =
--   the translated text) and a PUBLIC-READ policy that only ever exposes a
--   translation when its parent content row is `approved` (status + city scoping
--   from §5 are inherited from the parent through public.content_is_approved()).
--
--   What was missing was the WRITE path: no admin policies and no insert/update/
--   delete grants, so the moderation screen (running under the owner's normal
--   session, NOT the service_role key) could not save translations. This file
--   adds exactly that — nothing else changes.
--
-- ACCESS MODEL (mirrors places/news/events/guides in admin*.sql)
--   * Public (anon + authenticated): read translations of APPROVED parents only
--     (policy lives in schema.sql; re-created here so this file is self-contained
--     and idempotent).
--   * Admins (public.is_admin()): read translations of ANY parent (so the editor
--     can load existing translations for a still-pending row) and INSERT /
--     UPDATE / DELETE freely.
--   * Translation is INDEPENDENT of status (§ task): a row can be approved with
--     or without translations, and translations can be written before or after
--     approval. We deliberately do NOT gate admin writes on parent status.
-- ============================================================================

-- The table must already exist (schema.sql). Guard so a partial setup fails with
-- a clear message instead of a confusing "relation does not exist" mid-policy.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'content_translations'
  ) then
    raise exception
      'public.content_translations is missing — run supabase/schema.sql first.';
  end if;
end $$;

alter table public.content_translations enable row level security;

-- ----------------------------------------------------------------------------
-- Public / ordinary users: read translations whose parent content is approved.
-- (Same policy as schema.sql; restated here for a self-contained, re-runnable
-- file. content_is_approved() carries the §5 status + city scoping implicitly,
-- because it checks the parent row which is itself city-scoped and moderated.)
-- ----------------------------------------------------------------------------
drop policy if exists "read approved translations" on public.content_translations;
create policy "read approved translations" on public.content_translations
  for select to anon, authenticated
  using (public.content_is_approved(entity_type, entity_id));

-- ----------------------------------------------------------------------------
-- Admins: read translations for rows in ANY status, so the editor can preload
-- whatever already exists even while the parent is still pending.
-- ----------------------------------------------------------------------------
drop policy if exists "admins read all translations" on public.content_translations;
create policy "admins read all translations" on public.content_translations
  for select to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Admins: create / edit / remove translations.
-- ----------------------------------------------------------------------------
drop policy if exists "admins insert translations" on public.content_translations;
create policy "admins insert translations" on public.content_translations
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update translations" on public.content_translations;
create policy "admins update translations" on public.content_translations
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete translations" on public.content_translations;
create policy "admins delete translations" on public.content_translations
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Table-level write grants for the authenticated role (RLS above still applies
-- on top, so only admins can actually write). SELECT was already granted in
-- supabase/schema.sql.
-- ----------------------------------------------------------------------------
grant insert, update, delete on public.content_translations to authenticated;
