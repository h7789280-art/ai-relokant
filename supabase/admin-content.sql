-- ============================================================================
-- CityMate — admin moderation for news / events / guides (CLAUDE.md §5, §7, §11)
-- Stage 10 (extends supabase/admin.sql, which covered places only).
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql
-- and supabase/admin.sql (it relies on public.is_admin() defined there).
-- Idempotent and safe to re-run.
--
-- Same model as places: public (anon) keeps read-of-approved-only; admins
-- (public.is_admin()) can read rows in ANY status and INSERT / UPDATE / DELETE.
-- Ordinary authenticated users get NO write access and CANNOT read pending.
--
-- `ads` is intentionally left out — it is not yet surfaced in the admin UI and
-- gets the same treatment when its moderation screen lands.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- news
-- ----------------------------------------------------------------------------
-- Public / ordinary users: approved rows only (matches supabase/schema.sql).
drop policy if exists "read approved news" on public.news;
create policy "read approved news" on public.news
  for select to anon, authenticated
  using (status = 'approved');

-- Admins: read rows in ANY status (so the moderation list shows pending too).
drop policy if exists "admins read all news" on public.news;
create policy "admins read all news" on public.news
  for select to authenticated
  using (public.is_admin());

-- Admins: create / edit / remove.
drop policy if exists "admins insert news" on public.news;
create policy "admins insert news" on public.news
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update news" on public.news;
create policy "admins update news" on public.news
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete news" on public.news;
create policy "admins delete news" on public.news
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
drop policy if exists "read approved events" on public.events;
create policy "read approved events" on public.events
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "admins read all events" on public.events;
create policy "admins read all events" on public.events
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert events" on public.events;
create policy "admins insert events" on public.events
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update events" on public.events;
create policy "admins update events" on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete events" on public.events;
create policy "admins delete events" on public.events
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- guides
-- ----------------------------------------------------------------------------
drop policy if exists "read approved guides" on public.guides;
create policy "read approved guides" on public.guides
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "admins read all guides" on public.guides;
create policy "admins read all guides" on public.guides
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert guides" on public.guides;
create policy "admins insert guides" on public.guides
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update guides" on public.guides;
create policy "admins update guides" on public.guides
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete guides" on public.guides;
create policy "admins delete guides" on public.guides
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Table-level write grants for the authenticated role (RLS above still applies
-- on top, so only admins can actually write). SELECT was already granted in
-- supabase/schema.sql.
-- ----------------------------------------------------------------------------
grant insert, update, delete on public.news   to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, update, delete on public.guides to authenticated;
