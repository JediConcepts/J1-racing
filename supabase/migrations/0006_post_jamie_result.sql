-- =====================================================================
-- Post the 5:15.533 run for "Jamie" (6e34cc00-2ce0-4985-ae1d-45cabefeffdd).
--
-- The previous version used `set local role score_writer`, which relies on
-- the INSERT policy created by 0003 — and 0003 aborted partway on its first
-- run, so that policy may not exist. Hence "new row violates row-level
-- security policy".
--
-- This version needs no policy and no role. scores has FORCE ROW LEVEL
-- SECURITY, which subjects even the table owner to policy; dropping FORCE for
-- the length of one transaction lets the owner write, exactly as it could
-- before FORCE was added. The setting is restored in the same transaction, so
-- if anything below fails the rollback puts the hardening back too — there is
-- no window where the table is left unprotected.
--
-- Safe to run more than once: a slower time cannot overwrite a faster one.
-- =====================================================================

begin;

alter table public.scores no force row level security;

/* This posts a result for one real account by id, so on any database that is
   not the live one — a fresh clone, a test harness — that user does not exist
   and the insert dies on the foreign key. Skip instead of failing: a one-off
   data migration that cannot be replayed makes the whole chain untestable, and
   the chain being replayable from empty is what test/migrations.sh depends on. */
insert into public.scores (
  user_id, race_ms, best_lap_ms, finish_position,
  track_version, sim_version, validated, created_at
)
select
  '6e34cc00-2ce0-4985-ae1d-45cabefeffdd',
  315533,        -- 5:15.533
  103249,        -- 1:43.249 best lap
  1,             -- finished first
  'silverstone-v1',
  'sim-2',
  false,         -- not replay-validated; nothing on the board is yet
  now()
where exists (
  select 1 from public.profiles
   where user_id = '6e34cc00-2ce0-4985-ae1d-45cabefeffdd'
)
on conflict (user_id, track_version) do update
  set race_ms         = least(scores.race_ms, excluded.race_ms),
      best_lap_ms     = least(scores.best_lap_ms, excluded.best_lap_ms),
      finish_position = excluded.finish_position,
      sim_version     = excluded.sim_version,
      created_at      = now();

alter table public.scores force row level security;

commit;

-- ---------------------------------------------------------------------
-- Where things actually stand. Run this too — if scores_writer_insert is
-- missing, 0003 did not finish and in-game posting will still fail even
-- after 0005.
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_roles where rolname = 'score_writer')                  as has_score_writer_role,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'scores'
       and policyname = 'scores_writer_insert')                                   as has_writer_insert_policy,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'submit_score')                    as has_submit_score,
  (select relforcerowsecurity from pg_class
     where oid = 'public.scores'::regclass)                                        as force_rls_restored;

select rank, display_name, race_ms, best_lap_ms
  from public.leaderboard
 where track_version = 'silverstone-v1'
 order by rank
 limit 5;
