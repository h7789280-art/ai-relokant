-- ============================================================================
-- CityMate — per-user favorites (CLAUDE.md §3, §4) — Stage 11A
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql.
-- Idempotent and safe to re-run.
--
-- The user is signed in (favorites require an account), so we keep favorites in
-- the database — they survive a device change. `item_type` is 'place' for now
-- but leaves room to favorite events/guides later without a schema change.
--
-- ACCESS MODEL: a signed-in user can read AND change ONLY their own rows
-- (user_id = auth.uid()) — select / insert / delete. No update is needed (a
-- favorite is a presence, you add or remove it). Nobody can see anyone else's.
-- ============================================================================

create table if not exists public.favorites (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  item_type  text        not null default 'place',
  item_id    uuid        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

-- Helps the "my favorites, newest first" read stay cheap.
create index if not exists favorites_user_created_idx
  on public.favorites (user_id, item_type, created_at desc);

alter table public.favorites enable row level security;

-- A signed-in user may read only their own favorites.
drop policy if exists "read own favorites" on public.favorites;
create policy "read own favorites" on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

-- …and add only rows owned by themselves.
drop policy if exists "insert own favorites" on public.favorites;
create policy "insert own favorites" on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

-- …and remove only their own.
drop policy if exists "delete own favorites" on public.favorites;
create policy "delete own favorites" on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());

-- Table-level grants for the client role; RLS above narrows them to own rows.
-- No update grant: favorites are add/remove only.
grant select, insert, delete on public.favorites to authenticated;
