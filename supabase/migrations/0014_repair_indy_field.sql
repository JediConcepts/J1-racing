-- =====================================================================
-- 0010 never applied. Indianapolis and Brands Hatch have been showing one
-- entry each since they shipped.
--
-- The Indy seed ends on P33, because the Indianapolis 500 starts 33 cars —
-- 0010 says so in its own header. 0001 constrained finish_position to
-- `between 1 and 32`. So the twelfth insert of the loop violated the check, and
-- because the whole seed is one do-block it rolled back completely, taking the
-- Brands Hatch seeds with it even though nothing was wrong with those.
--
-- Live board before this migration:
--   silverstone-v1    19 entries
--   indianapolis-v1    1
--   brands-hatch-v1    1
--
-- Nothing reported it. The migration was run once, the error scrolled past, and
-- the two new circuits looked plausibly quiet rather than broken — which is
-- precisely the failure 0003's own comment warns about, a board that hides
-- everything being indistinguishable from a board that is empty.
--
-- Found by test/migrations.sh on the first run that applied all thirteen files
-- to an empty PostgreSQL 17 and asserted the result, rather than trusting that
-- a migration which was run must have worked.
--
-- 32 was simply the wrong number. This widens it rather than clipping the grid,
-- and 0001 now creates it at 33 so a fresh database never has the narrow form.
-- Both are needed: 0001 for new databases, this for the live one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The constraint. Idempotent: on a database built from the corrected 0001
--    this drops and recreates an identical check.
-- ---------------------------------------------------------------------
alter table public.scores drop constraint if exists scores_finish_position_check;
alter table public.scores add constraint scores_finish_position_check
  check (finish_position between 1 and 33);

-- ---------------------------------------------------------------------
-- 2. The seeds 0010 failed to write. Same twelve accounts, same times, same
--    reasoning — deliberately slower than the AI so a clean race beats most of
--    them. Reproduced here rather than asking anyone to re-run 0010, because
--    0010 is now a file whose job is done and re-running migrations by hand is
--    how databases drift.
--
--    FORCE ROW LEVEL SECURITY subjects even the owner to policy, and there is
--    no owner INSERT policy on scores, so drop FORCE for the transaction the
--    way 0006 does. Restored below, and a rollback restores it too, so there is
--    no window where the table is unprotected.
-- ---------------------------------------------------------------------
begin;

alter table public.scores no force row level security;

do $$
declare
  v_ids  uuid[];
  -- Indianapolis: 5 laps of the oval, 33 cars, AI runs about 6:00
  v_indy_race int[] := array[380200, 388700, 397300, 405900, 414600, 423200,
                             431900, 440500, 449200, 457800, 466500, 475100];
  v_indy_lap  int[] := array[ 74200,  75900,  77600,  79300,  81000,  82700,
                              84400,  86100,  87800,  89500,  91200,  92900];
  v_indy_pos  int[] := array[12, 15, 17, 19, 21, 23, 25, 27, 29, 30, 31, 33];
  -- Brands Hatch: 4 laps, AI runs about 5:10
  v_bh_race   int[] := array[330400, 337200, 344100, 350900, 357800, 364600,
                             371500, 378300, 385200, 392000, 398900, 405700];
  v_bh_lap    int[] := array[ 81600,  83300,  85000,  86700,  88400,  90100,
                              91800,  93500,  95200,  96900,  98600, 100300];
  v_bh_pos    int[] := array[3, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 6];
  i int;
begin
  /* The same twelve pace-setters from 0004, in a stable order so a rerun writes
     the same rows. scores is unique on (user_id, track_version), so one
     personal best each per circuit. */
  select array_agg(u.id order by u.email)
    into v_ids
    from auth.users u
   where u.email like '%@pace.invalid';

  if v_ids is null or array_length(v_ids, 1) < 12 then
    raise notice 'skipped: expected 12 @pace.invalid seed accounts, found %',
      coalesce(array_length(v_ids, 1), 0);
    return;
  end if;

  for i in 1 .. 12 loop
    insert into public.scores (user_id, race_ms, best_lap_ms, finish_position,
                               track_version, sim_version, validated, created_at)
    values (v_ids[i], v_indy_race[i], v_indy_lap[i], v_indy_pos[i]::smallint,
            'indianapolis-v1', 'seed', false, now() - ((13 - i) || ' days')::interval)
    on conflict (user_id, track_version) do nothing;

    insert into public.scores (user_id, race_ms, best_lap_ms, finish_position,
                               track_version, sim_version, validated, created_at)
    values (v_ids[i], v_bh_race[i], v_bh_lap[i], v_bh_pos[i]::smallint,
            'brands-hatch-v1', 'seed', false, now() - ((13 - i) || ' days')::interval)
    on conflict (user_id, track_version) do nothing;
  end loop;
end $$;

alter table public.scores force row level security;

commit;

-- ---------------------------------------------------------------------
-- Confirm. All three boards should now have a field on them, and the widened
-- constraint should read 1..33.
-- ---------------------------------------------------------------------
select track_version, count(*) as entries, max(finish_position) as last_place
  from public.scores
 group by track_version
 order by track_version;

select pg_get_constraintdef(oid) as finish_position_check
  from pg_constraint
 where conrelid = 'public.scores'::regclass
   and conname = 'scores_finish_position_check';
