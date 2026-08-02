-- =====================================================================
-- Make the leaderboard actually work.
--
-- Replay validation is still the goal, but it needs a baked track and a
-- headless sim that do not exist yet. This adds the write path now, WITHOUT
-- opening the scores table to clients:
--
--   * scores stays locked — no client INSERT or UPDATE grant, ever.
--   * the only way in is submit_score(), a SECURITY DEFINER function that
--     derives user_id from the JWT. It is never a parameter, so nobody can
--     post a time under someone else's name.
--   * every row is validated = false until the validator has re-simulated
--     its trace. The board shows them, flagged, rather than hiding them.
--
-- Honest about what this is: until the validator exists, a determined player
-- who reads the JS can call submit_score with an invented time. The trace is
-- stored regardless, so those runs can be re-checked and purged later.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A least-privilege owner for the write path.
--    NOT superuser, NOT bypassrls — so it is still subject to policy, and
--    a bug in the function cannot quietly read the whole database.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'score_writer') then
    create role score_writer nologin;
  end if;
end $$;

grant score_writer to postgres;

-- CREATE, not just USAGE: ALTER FUNCTION ... OWNER TO requires the incoming
-- owner to hold CREATE on the containing schema, or it fails with
-- "42501: permission denied for schema public". It is revoked again at the
-- bottom of this file once the ownership transfer is done.
grant usage, create on schema public to score_writer;

-- The auth schema belongs to supabase_auth_admin and is not always grantable
-- from here. If it fails the function still works, because auth.uid() is
-- executable by PUBLIC on Supabase — so do not let it abort the migration.
do $$
begin
  execute 'grant usage on schema auth to score_writer';
exception when insufficient_privilege or undefined_object then
  raise notice 'skipped: grant usage on schema auth (not grantable here)';
end $$;

grant select, insert, update on public.scores to score_writer;
grant select on public.profiles to score_writer;

-- Under FORCE ROW LEVEL SECURITY a SECURITY DEFINER function is STILL subject
-- to policy — being the owner is not enough. Without these two the function
-- silently writes nothing.
drop policy if exists scores_writer_insert on public.scores;
drop policy if exists scores_writer_update on public.scores;
create policy scores_writer_insert on public.scores
  for insert to score_writer with check (true);
create policy scores_writer_update on public.scores
  for update to score_writer using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2. run_id was mandatory for the token flow that does not exist yet.
-- ---------------------------------------------------------------------
alter table public.scores alter column run_id drop not null;

-- ---------------------------------------------------------------------
-- 3. Show unvalidated runs, flagged. A board that hides everything until a
--    validator exists is indistinguishable from a broken board.
-- ---------------------------------------------------------------------
drop policy if exists scores_public_read on public.scores;
create policy scores_public_read on public.scores
  for select to anon, authenticated using (true);

drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = true) as
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
-- 4. The write path. Note there is NO user_id parameter — attribution is
--    derived from the verified JWT, never accepted from the caller.
--    Keeps the personal best: a slower run does not overwrite a faster one.
-- ---------------------------------------------------------------------
create or replace function public.submit_score(
  p_track_version   text,
  p_sim_version     text,
  p_race_ms         integer,
  p_best_lap_ms     integer,
  p_finish_position smallint,
  p_trace_key       text default null
)
returns table (improved boolean, best_race_ms integer, board_rank bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_prev integer;
  v_impr boolean := false;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'no profile' using errcode = '23503';
  end if;

  /* The table's CHECK constraints are the real floor, but rejecting here
     gives the player a usable message instead of a constraint violation. */
  if p_race_ms is null or p_race_ms < 60000 or p_race_ms > 1800000 then
    raise exception 'implausible race time' using errcode = '22003';
  end if;
  if p_best_lap_ms is null or p_best_lap_ms < 20000 or p_best_lap_ms > 600000 then
    raise exception 'implausible lap time' using errcode = '22003';
  end if;
  if p_best_lap_ms > p_race_ms then
    raise exception 'best lap cannot exceed race time' using errcode = '22003';
  end if;

  select race_ms into v_prev
    from public.scores
   where user_id = v_uid and track_version = p_track_version;

  if v_prev is null then
    insert into public.scores (user_id, race_ms, best_lap_ms, finish_position,
                               track_version, sim_version, trace_key, validated)
    values (v_uid, p_race_ms, p_best_lap_ms, p_finish_position,
            p_track_version, p_sim_version, p_trace_key, false);
    v_impr := true;
  elsif p_race_ms < v_prev then
    update public.scores
       set race_ms         = p_race_ms,
           /* a slower race can still contain a faster single lap */
           best_lap_ms     = least(best_lap_ms, p_best_lap_ms),
           finish_position = p_finish_position,
           sim_version     = p_sim_version,
           trace_key       = coalesce(p_trace_key, trace_key),
           validated       = false,
           created_at      = now()
     where user_id = v_uid and track_version = p_track_version;
    v_impr := true;
  else
    /* Not a new best overall, but keep a faster lap if there was one. */
    update public.scores
       set best_lap_ms = least(best_lap_ms, p_best_lap_ms)
     where user_id = v_uid and track_version = p_track_version
       and best_lap_ms > p_best_lap_ms;
  end if;

  return query
    with board as (
      select s.user_id,
             row_number() over (order by s.race_ms, s.created_at) as rnk,
             s.race_ms
        from public.scores s
       where s.track_version = p_track_version
    )
    select v_impr, b.race_ms, b.rnk from board b where b.user_id = v_uid;
end $$;

alter function public.submit_score(text, text, integer, integer, smallint, text)
  owner to score_writer;
revoke all on function public.submit_score(text, text, integer, integer, smallint, text) from public, anon;
grant execute on function public.submit_score(text, text, integer, integer, smallint, text) to authenticated;

-- Ownership is transferred, so score_writer no longer needs to create
-- anything. Take it back: this role exists to own one function, nothing more.
revoke create on schema public from score_writer;
