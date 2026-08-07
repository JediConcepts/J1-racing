-- =====================================================================
-- The leaderboard view's data minimisation was decorative.
--
-- 0003 built public.leaderboard to project nine columns and deliberately NOT
-- user_id — a real decision, so the public board would not hand out an auth
-- identifier for every player. But 0001 also granted SELECT on the base tables
-- to anon, so anybody holding the publishable key could skip the view:
--
--   GET /rest/v1/scores?limit=1
--   -> 200 [{ id, run_id, user_id, ..., validated, trace_key, created_at }]
--
-- Every player's auth UUID, enumerable, plus trace_key. Low severity — a UUID
-- is not a credential and trace_key is null everywhere — but the projection was
-- supposed to be the boundary and it was not one.
--
-- Found by an external audit of the live API, which also reported the 200s on
-- profiles and scores as a release blocker. They were not: they are what 0001
-- granted on purpose, and revoking them ALONE would have emptied the public
-- board, because the view is security_invoker = true and therefore reads with
-- the caller's own privileges. That is the trap this migration has to avoid.
--
-- So the two halves have to move together:
--   1. the view stops borrowing the caller's privileges and reads as owner
--   2. and only then can the caller's own privileges be taken away
--
-- Nothing in the client is affected. It never reads scores directly — only
-- profiles, twice, both gated on being signed in and both filtered to
-- .eq('user_id', this.user.id) — and the leaderboard view.
--
-- WHY A DEFINER VIEW IS SAFE HERE, since it is normally a footgun and Supabase's
-- own advisor flags it: the view takes no input. It is a fixed projection with
-- no user-supplied predicate, so a caller can only ever narrow the rows it
-- returns, never widen the columns. The thing that makes definer views
-- dangerous is a view that filters on something the caller controls. This one
-- cannot.
--
-- ROLLBACK, if the public board goes empty:
--   grant select on public.scores   to anon, authenticated;
--   grant select on public.profiles to anon, authenticated;
--   drop policy if exists profiles_self_read on public.profiles;
--   create policy profiles_public_read on public.profiles
--     for select to anon, authenticated using (true);
--   -- and recreate the view with (security_invoker = true)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The view reads as owner, so it no longer depends on the caller having
--    any access to the tables underneath it.
-- ---------------------------------------------------------------------
drop view if exists public.leaderboard;

create view public.leaderboard
with (security_invoker = false) as
select
  row_number() over (
    partition by s.track_version
    order by s.race_ms, s.created_at
  ) as rank,
  s.track_version,
  p.display_name,
  p.country_code,
  s.race_ms,
  s.best_lap_ms,
  s.finish_position,
  s.validated,
  s.created_at
from public.scores s
join public.profiles p on p.user_id = s.user_id;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Now take the base tables away. scores goes entirely: no client has ever
--    had a reason to read it, and everything it exposes that the board needs
--    comes through the view.
-- ---------------------------------------------------------------------
revoke select on public.scores from anon, authenticated;

-- profiles: anon has no use for it at all, and a signed-in player needs
-- exactly one row — their own — which is what loadProfile() and the rename
-- both ask for.
revoke select on public.profiles from anon;

drop policy if exists profiles_public_read on public.profiles;
drop policy if exists profiles_self_read   on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 3. What still works, and why, because every one of these would be a silent
--    breakage rather than a loud one:
--
--    * the board, for anyone signed in or out — the view is definer now
--    * driver_name_available() — SECURITY DEFINER, reads profiles as owner,
--      so RLS on profiles does not apply to it
--    * handle_new_user() — same, including its uniqueness loop over profiles
--    * submit_score() — runs as score_writer, which has its own
--      profiles_writer_read and scores_writer_read policies from 0008, and
--      those are scoped `to score_writer` so nothing above touches them
--    * the rename — UPDATE(display_name) from 0009 plus the returning
--      select(), both on the player's own row, which profiles_self_read allows
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Confirm.
-- ---------------------------------------------------------------------
-- The view must be the only thing anon can read. Expect leaderboard and
-- track_versions only.
select table_name, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and grantee = 'anon'
 order by table_name, privilege_type;

-- authenticated keeps profiles (own row, via RLS) and the two read-only
-- projections. It must NOT have scores.
select table_name, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and grantee = 'authenticated'
 order by table_name, privilege_type;

-- The view must report security_invoker off. An empty reloptions, or one
-- without security_invoker=true, means it reads as owner.
select c.relname, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'leaderboard';

-- And the board still has rows in it.
select track_version, count(*) as entries from public.leaderboard
 group by track_version order by track_version;
