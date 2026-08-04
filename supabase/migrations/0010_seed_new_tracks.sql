-- =====================================================================
-- Pace-setters for INDIANAPOLIS and BRANDS HATCH, so the two new boards
-- are not empty on day one — same idea as 0004, extended to the circuits
-- that did not exist when that ran.
--
-- REUSES THE EXISTING SEED ACCOUNTS. scores is unique on
-- (user_id, track_version), so the same twelve drivers can hold one
-- personal best per circuit. Creating a second set of accounts would put
-- twenty-four fake names in a leaderboard that only ever shows one board
-- at a time, for no gain.
--
-- Deliberately SLOW, as before. Targets, from the AI's own pace:
--   Indianapolis  5 laps, AI runs about 6:00  -> seeds 6:20 to 7:55
--   Brands Hatch  4 laps, AI runs about 5:10  -> seeds 5:30 to 6:52
-- A player who finishes a clean race should beat most of these at once.
--
-- Idempotent: on conflict does nothing, so running it twice is harmless.
--
-- TO REMOVE JUST THESE (leaves the Silverstone seeds alone):
--   delete from public.scores
--    where track_version in ('indianapolis-v1', 'brands-hatch-v1')
--      and user_id in (select id from auth.users
--                       where email like '%@pace.invalid');
-- =====================================================================

do $$
declare
  v_ids   uuid[];
  -- Indianapolis: 5 laps of a 2.5 mile oval, 33 cars
  v_indy_race int[] := array[380200, 388700, 397300, 405900, 414600, 423200,
                             431900, 440500, 449200, 457800, 466500, 475100];
  v_indy_lap  int[] := array[ 75100,  76800,  78500,  80200,  81900,  83600,
                              85300,  87000,  88700,  90400,  92100,  93800];
  v_indy_pos  int[] := array[12, 15, 17, 19, 21, 23, 25, 27, 29, 30, 31, 33];
  -- Brands Hatch: 4 laps, 6 cars
  v_bh_race   int[] := array[330400, 337900, 345300, 352800, 360200, 367700,
                             375100, 382600, 390000, 397500, 404900, 412400];
  v_bh_lap    int[] := array[ 81200,  83000,  84800,  86600,  88400,  90200,
                              92000,  93800,  95600,  97400,  99200, 101000];
  v_bh_pos    int[] := array[3, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 6];
  i int;
begin
  -- Same twelve, in the order 0004 created them, so the fast seeds stay
  -- fast across every board rather than being reshuffled per circuit.
  select array_agg(id order by email) into v_ids
    from auth.users
   where email like 'pace%@pace.invalid';

  if v_ids is null or array_length(v_ids, 1) < 12 then
    raise notice 'Seed accounts from 0004 not found — nothing to do.';
    return;
  end if;

  for i in 1 .. 12 loop
    insert into public.scores (
      user_id, race_ms, best_lap_ms, finish_position,
      track_version, sim_version, validated, created_at
    ) values (
      v_ids[i], v_indy_race[i], v_indy_lap[i], v_indy_pos[i],
      'indianapolis-v1', 'mcl64-1', false, now() - ((13 - i) || ' days')::interval
    ) on conflict (user_id, track_version) do nothing;

    insert into public.scores (
      user_id, race_ms, best_lap_ms, finish_position,
      track_version, sim_version, validated, created_at
    ) values (
      v_ids[i], v_bh_race[i], v_bh_lap[i], v_bh_pos[i],
      'brands-hatch-v1', 'mcl64-1', false, now() - ((13 - i) || ' days')::interval
    ) on conflict (user_id, track_version) do nothing;
  end loop;
end $$;

-- Check: three boards, twelve seeds each plus whatever real times exist.
select track_version, count(*) as entries,
       min(race_ms) as fastest_ms, max(race_ms) as slowest_ms
  from public.scores
 group by track_version
 order by track_version;
