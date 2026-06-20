-- ============================================================================
-- CityMate — admin moderation access (CLAUDE.md §5, §7, §12) — Stage 10
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql.
-- Idempotent and safe to re-run.
--
-- What this sets up:
--   * `admins` — the list of owners / moderators (one row per privileged user).
--   * RLS so a signed-in user can read ONLY their own admins row — just enough
--     for the app to ask "am I an admin?" — and nothing else.
--   * Admin RLS policies on `places`: admins can read rows in ANY status and
--     INSERT / UPDATE / DELETE them. Public (anon) keeps read-of-approved-only;
--     ordinary authenticated users get NO write access and CANNOT read pending.
--
-- This stage covers places/services only. The other moderated content tables
-- (events, guides, news, ads) get the same treatment in a later step.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admins — owners / moderators (CLAUDE.md §7)
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- A signed-in user may read ONLY their own row, so the app can check whether the
-- current user is an admin. No insert/update/delete policies => the client can
-- never grant or revoke admin rights; that happens only via the SQL editor /
-- service_role key (which bypasses RLS).
drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- The client role needs the table-level SELECT privilege; RLS narrows it to the
-- caller's own row. No write grants for anon/authenticated.
grant select on public.admins to authenticated;

-- ----------------------------------------------------------------------------
-- is_admin() — is the current user an admin? (CLAUDE.md §7)
-- SECURITY DEFINER so it can read `admins` regardless of the caller's own RLS;
-- this also avoids any RLS recursion when used inside the places policies below.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- places — admin moderation policies (CLAUDE.md §7, §12)
--   * Keep public read-of-approved (anon + authenticated) — re-created here so
--     the file is self-contained and idempotent.
--   * Add admin-only full read + full write. Non-admin authenticated users still
--     only ever see approved rows and have no write rights.
-- ----------------------------------------------------------------------------

-- Public / ordinary users: approved rows only (matches supabase/schema.sql).
drop policy if exists "read approved places" on public.places;
create policy "read approved places" on public.places
  for select to anon, authenticated
  using (status = 'approved');

-- Admins: read rows in ANY status (so the moderation list shows pending too).
drop policy if exists "admins read all places" on public.places;
create policy "admins read all places" on public.places
  for select to authenticated
  using (public.is_admin());

-- Admins: create / edit / remove places.
drop policy if exists "admins insert places" on public.places;
create policy "admins insert places" on public.places
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update places" on public.places;
create policy "admins update places" on public.places
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete places" on public.places;
create policy "admins delete places" on public.places
  for delete to authenticated
  using (public.is_admin());

-- Table-level write grants for the authenticated role (RLS above still applies
-- on top, so only admins can actually write).
grant insert, update, delete on public.places to authenticated;

-- ============================================================================
-- Make yourself an admin (owner bootstrap).
-- ----------------------------------------------------------------------------
-- Find YOUR user id in the Supabase dashboard:
--   Authentication → Users → click your account → copy the "User UID".
-- Then uncomment the line below, paste the UID, and run it:
--
-- insert into public.admins (user_id) values ('МОЙ_USER_ID')
-- on conflict (user_id) do nothing;
-- ============================================================================
