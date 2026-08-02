-- =====================================================================
-- Fix: "permission denied for schema auth" when posting a score.
--
-- submit_score is SECURITY DEFINER owned by score_writer, so at runtime it
-- executes AS score_writer — and score_writer has no USAGE on the auth
-- schema, because that schema belongs to supabase_auth_admin and is not
-- reliably grantable from the SQL editor. 0003 made that grant non-fatal,
-- which was the wrong call: it turned a loud migration failure into a silent
-- runtime one that only showed up at the chequered flag.
--
-- The fix removes the dependency instead of trying to satisfy it. auth.uid()
-- is a thin wrapper over a request-local setting, so read the claim directly.
-- current_setting lives in pg_catalog, which is always on the search path,
-- so this works with search_path = '' and needs no grants at all.
-- =====================================================================

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
  v_uid  uuid;
  v_prev integer;
  v_impr boolean := false;
begin
  /* Exactly what auth.uid() does, without needing the auth schema. The claim
     is set by PostgREST from the verified JWT, so it still cannot be forged
     by the caller — attribution is derived, never accepted. */
  begin
    v_uid := nullif(
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''
    )::uuid;
  exception when others then
    v_uid := null;
  end;

  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'no profile for this account' using errcode = '23503';
  end if;

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
           best_lap_ms     = least(best_lap_ms, p_best_lap_ms),
           finish_position = p_finish_position,
           sim_version     = p_sim_version,
           trace_key       = coalesce(p_trace_key, trace_key),
           validated       = false,
           created_at      = now()
     where user_id = v_uid and track_version = p_track_version;
    v_impr := true;
  else
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
