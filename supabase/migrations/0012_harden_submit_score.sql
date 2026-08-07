-- =====================================================================
-- Two holes in submit_score(), both found by security review.
--
-- 1. THE TRACE KEY WAS THE CALLER'S TO CHOOSE.
--
-- p_trace_key was accepted verbatim and stored, with no check that the trace
-- it points at belongs to the player submitting. Nothing reads the column yet,
-- so nothing is exploitable today — but the column exists for exactly one
-- reason, which is the validator that re-simulates a submitted trace, and this
-- would have handed that validator an attacker-chosen pointer.
--
-- The attack it sets up: submit a 4:30 with p_trace_key pointing at somebody
-- else's honest run. The row lands validated = false as designed. When the
-- validator ships it fetches that trace, replays a genuine clean race, and
-- marks the invented time validated = true. The stated mitigation for having
-- no validator yet — "those runs can be re-checked and purged later" — is
-- precisely what that defeats.
--
-- Fixed by DELETION rather than by validation. Nothing in the client ever set
-- traceKey: `git grep traceKey -- src` returns exactly one line, the payload
-- that sends it, and no code anywhere assigns it. There is no upload path. So
-- the parameter was pure attack surface with no caller, and the fix is to stop
-- honouring it. scores.trace_key stays — the validator will need it — and is
-- now writable only by score_writer and the service role, never by a client.
--
-- The signature keeps its sixth parameter, on purpose. It already had
-- `default null`, so a five-argument call resolves to it happily, which means
-- the deployed client and the updated one both work and this migration can be
-- applied before or after a deploy without a window where scoring breaks. The
-- parameter is now ignored. Drop it once no cached client sends it.
--
-- 2. TRACK VERSION WAS FREE TEXT, AND IT PARTITIONS THE BOARD.
--
-- No allowlist, so a player could submit track_version = 'silverstone-v1 '
-- with a trailing space, or any novel string, and own rank 1 of a board with
-- one entry on it. It is bound as a parameter so there was never an injection
-- risk, but it pollutes the table permanently and can be made to look like a
-- record.
--
-- Fixed with a lookup table rather than a CHECK constraint, so adding a
-- circuit stays a one-row insert like the seeds in 0010 rather than a
-- constraint rebuild.
--
-- NO FOREIGN KEY ON scores, deliberately. Every row this repository created
-- uses one of the three known ids, but submit_score accepted anything for as
-- long as it has been live, and this migration cannot see production data. A
-- foreign key would fail the migration on rows nobody has looked at yet. The
-- enforcement below stops any new junk; the last query in this file lists any
-- junk that already exists, and the key can be added once that returns empty.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. What a circuit is allowed to be. Ids come from src/20-track.js.
-- ---------------------------------------------------------------------
create table if not exists public.track_versions (
  id         text primary key,
  label      text not null,
  created_at timestamptz not null default now()
);

insert into public.track_versions (id, label) values
  ('silverstone-v1',  'Silverstone'),
  ('indianapolis-v1', 'Indianapolis'),
  ('brands-hatch-v1', 'Brands Hatch')
on conflict (id) do nothing;

-- Readable, because the client already knows these ids and a board picker is
-- a reasonable thing to drive from the database later. Never writable.
revoke all on public.track_versions from anon, authenticated;
grant select on public.track_versions to anon, authenticated;

alter table public.track_versions enable row level security;
alter table public.track_versions force row level security;

drop policy if exists track_versions_public_read on public.track_versions;
create policy track_versions_public_read on public.track_versions
  for select to anon, authenticated using (true);

-- submit_score runs as score_writer, which is neither of those roles, and
-- under FORCE ROW LEVEL SECURITY no matching policy means zero rows —
-- silently. That is the bug 0008 had to fix on two other tables; do not
-- repeat it here.
drop policy if exists track_versions_writer_read on public.track_versions;
create policy track_versions_writer_read on public.track_versions
  for select to score_writer using (true);

grant select on public.track_versions to score_writer;

-- ---------------------------------------------------------------------
-- 2. The write path, with both holes closed.
-- ---------------------------------------------------------------------
create or replace function public.submit_score(
  p_track_version   text,
  p_sim_version     text,
  p_race_ms         integer,
  p_best_lap_ms     integer,
  p_finish_position smallint,
  p_trace_key       text default null   -- IGNORED. See the header.
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

  /* A board is a circuit we actually ship, not whatever the caller types. */
  if not exists (select 1 from public.track_versions where id = p_track_version) then
    raise exception 'unknown track_version: %', p_track_version
      using errcode = '23514';
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
    /* trace_key deliberately absent from the column list — it defaults to
       null and only the validator may ever set it. */
    insert into public.scores (user_id, race_ms, best_lap_ms, finish_position,
                               track_version, sim_version, validated)
    values (v_uid, p_race_ms, p_best_lap_ms, p_finish_position,
            p_track_version, p_sim_version, false);
    v_impr := true;
  elsif p_race_ms < v_prev then
    update public.scores
       set race_ms         = p_race_ms,
           best_lap_ms     = least(best_lap_ms, p_best_lap_ms),
           finish_position = p_finish_position,
           sim_version     = p_sim_version,
           /* The previous trace described the previous run and this is a new
              one, so the old key is now wrong. Clear it rather than carry it
              forward — a stale trace is worse than none for the validator. */
           trace_key       = null,
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

-- ---------------------------------------------------------------------
-- Confirm.
-- ---------------------------------------------------------------------
-- Circuits the board will accept.
select id, label from public.track_versions order by id;

-- Any track_version already in scores that is NOT a known circuit. Expected
-- to be empty. If it is not, those rows were submitted through the hole this
-- migration closes — inspect them, delete them, and only then consider
--   alter table public.scores add constraint scores_track_version_fkey
--     foreign key (track_version) references public.track_versions(id);
select s.track_version, count(*) as rows, min(s.created_at) as first_seen
  from public.scores s
  left join public.track_versions t on t.id = s.track_version
 where t.id is null
 group by s.track_version
 order by rows desc;

-- Any score carrying a client-supplied trace key. Also expected to be empty:
-- the client never set one. Anything here was hand-crafted.
select count(*) as scores_with_trace_key from public.scores where trace_key is not null;
