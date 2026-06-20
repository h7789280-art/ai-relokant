-- ============================================================================
-- CityMate — per-user daily AI message usage (CLAUDE.md §6, §12)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor (after supabase/schema.sql).
-- Idempotent and safe to re-run.
--
-- Tracks how many AI chat messages each user has sent per day so the proxy
-- (api/chat.js) can enforce the ~10 messages/day free-tier limit server-side.
--
-- ACCESS MODEL (important): this table is written and read ONLY by the server,
-- via the Supabase service_role key (which bypasses RLS). RLS is enabled with
-- NO policies for anon/authenticated, so the table is completely invisible to
-- the client — a user can neither read nor reset their own counter.
-- ============================================================================

create table if not exists public.ai_usage (
  user_id       uuid    not null references auth.users(id) on delete cascade,
  usage_date    date    not null,
  message_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- Enable RLS but add NO policies: with RLS on and no policy, anon/authenticated
-- get zero rows and zero writes. Only the service_role key (server) can touch it.
alter table public.ai_usage enable row level security;

-- Defensively make sure no table-level grants leak access to the client roles.
revoke all on public.ai_usage from anon, authenticated;
