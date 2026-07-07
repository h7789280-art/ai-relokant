-- ============================================================================
-- CityMate — auto-cleanup of PAST events (CLAUDE.md §4 screen 5, owner rule)
-- ============================================================================
-- Run this file manually in the Supabase SQL editor, AFTER supabase/schema.sql
-- and supabase/admin-content.sql. Idempotent and safe to re-run.
--
-- WHAT THE APP ALREADY DOES (no SQL required for these)
--   • Hiding: past events disappear from the public afisha the moment their date
--     passes — the query filter lives in src/lib/content.js (fetchUpcomingEvents),
--     measured in Turkey time (UTC+3). Visibility only; nothing is deleted.
--   • Physical delete — button: the admin "Delete" button (Admin.jsx) removes an
--     event row + its content_translations. This is already permitted: the
--     `admins delete events` RLS policy exists in supabase/admin-content.sql and
--     the translations delete policy in supabase/translations.sql. NO NEW POLICY
--     IS NEEDED for the button.
--   • Physical delete — auto (lazy): opening the admin Events tab purges events
--     older than a buffer (default 7 days after their date). See purgePastEvents
--     in src/lib/admin.js. This is the DEFAULT cleanup path and needs no SQL.
--
-- WHY THIS FILE IS OPTIONAL
--   The lazy purge above already keeps the table tidy and runs under the owner's
--   admin session (consistent with RLS), with a buffer so nothing is deleted the
--   instant it ends. This file is only for owners who prefer a SERVER-SIDE
--   schedule that runs even if nobody opens the admin panel. It needs the
--   `pg_cron` extension, which may not be available/enabled on every plan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- purge_past_events(buffer_days) — delete events whose date is older than the
-- buffer, plus their (polymorphic, non-cascading) translations. Multi-day events
-- still running (ends_at in the future) and undated events (no starts_at) are
-- kept. SECURITY DEFINER so a scheduled job can run it without an admin session;
-- it is NOT granted to anon/authenticated, so it can't be called from the client.
-- ----------------------------------------------------------------------------
create or replace function public.purge_past_events(buffer_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - make_interval(days => buffer_days);
  deleted_ids uuid[];
begin
  with gone as (
    delete from public.events e
    where e.starts_at is not null
      and e.starts_at < cutoff
      and (e.ends_at is null or e.ends_at < cutoff)
    returning e.id
  )
  select array_agg(id) into deleted_ids from gone;

  if deleted_ids is null then
    return 0;
  end if;

  -- Clear orphaned translations (content_translations has no FK to events).
  delete from public.content_translations
  where entity_type = 'events'
    and entity_id = any(deleted_ids);

  return array_length(deleted_ids, 1);
end;
$$;

-- ----------------------------------------------------------------------------
-- OPTIONAL: schedule it daily with pg_cron. Uncomment to enable. Requires the
-- pg_cron extension (Supabase: Database → Extensions → enable "pg_cron").
-- ----------------------------------------------------------------------------
-- create extension if not exists pg_cron;
--
-- -- Run every day at 03:15 UTC; keep a 7-day buffer after each event's date.
-- select cron.schedule(
--   'citymate-purge-past-events',
--   '15 3 * * *',
--   $$ select public.purge_past_events(7); $$
-- );
--
-- -- To change the schedule/buffer later, unschedule then re-create:
-- -- select cron.unschedule('citymate-purge-past-events');
