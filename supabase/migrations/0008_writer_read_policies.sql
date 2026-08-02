-- =====================================================================
-- Fix: "no profile for this account" even though the profile exists.
--
-- submit_score() is SECURITY DEFINER owned by score_writer, so its queries
-- run AS score_writer. Both tables it reads have FORCE ROW LEVEL SECURITY,
-- and their SELECT policies are scoped `to anon, authenticated` — score_writer
-- is neither. A GRANT is not enough: under RLS, no matching policy means zero
-- rows, silently. So:
--
--   select 1 from public.profiles where user_id = v_uid   -> no rows
--   -> "no profile for this account", for an account that plainly has one.
--
-- The same applies to the scores read at the end of the function that works
-- out the board position, which would have returned no row and reported a
-- null rank even once the insert succeeded.
--
-- 0003 granted score_writer INSERT and UPDATE policies but never a SELECT one.
-- That is the whole bug.
-- =====================================================================

-- Read its own attribution target.
drop policy if exists profiles_writer_read on public.profiles;
create policy profiles_writer_read on public.profiles
  for select to score_writer using (true);

-- Read scores to compute the personal best and the board rank.
drop policy if exists scores_writer_read on public.scores;
create policy scores_writer_read on public.scores
  for select to score_writer using (true);

-- score_writer is NOLOGIN and holds no BYPASSRLS, and these two policies are
-- the entirety of what it can see. Nothing here widens what the API exposes:
-- anon and authenticated are unaffected, and private.player_pii still has no
-- SELECT policy for anyone at all.

-- ---------------------------------------------------------------------
-- Confirm the full policy set on both tables.
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'public' and tablename in ('scores', 'profiles')
 order by tablename, cmd, policyname;
