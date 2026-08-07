-- =====================================================================
-- Anonymous sign-ins made the leaderboard free to forge.
--
-- THE FINDING, reproduced against the live project on 2026-08-07:
--
--   $ curl -X POST https://<project>.supabase.co/auth/v1/signup \
--       -H "apikey: <the publishable key that ships in the page>" \
--       -H 'Content-Type: application/json' -d '{}'
--   200 { "access_token": "..." }
--
--   decoded: { "role": "authenticated", "is_anonymous": true, "email": "" }
--
-- No email. No verification. No mailer, so none of the mail rate limiting that
-- was the only thing making an identity cost anything. And `authenticated` is
-- exactly the role 0012 grants EXECUTE on submit_score.
--
-- That JWT reaches the body of submit_score. Proven without writing a score by
-- sending payloads that trip checks AFTER both authorisation gates:
--
--   unknown track   -> 23514 unknown track_version: __audit_probe...
--   race_ms = 1     -> 22003 implausible race time
--
-- Neither is 28000 "not signed in" or 23503 "no profile for this account", so
-- the caller was authenticated AND already had a profile row. A valid payload
-- would have inserted.
--
-- What that adds up to: 0003 is honest that an invented time can be submitted
-- until the replay validator exists, and accepts that on the grounds that an
-- account is needed first. Anonymous sign-in removes the account. One script
-- mints N identities and takes all N top places, because scores_personal_best
-- is unique per (user_id, track_version) — a different user_id each time is a
-- different row, not a replacement.
--
-- Nothing in this repository calls signInAnonymously. `git grep -i anonymous
-- -- src` returns nothing. It is a project setting with no feature behind it,
-- so it is pure surface.
--
-- THE PRIMARY FIX IS NOT IN THIS FILE. It is the dashboard toggle:
--   Authentication -> Sign In / Providers -> Anonymous sign-ins -> off
-- Do that first. This migration is the second layer, so that re-enabling the
-- toggle later — deliberately or by restoring a project from a template —
-- cannot silently reopen the board.
--
-- WHY THE CLAIM AND NOT auth.users.is_anonymous: submit_score already derives
-- the caller from request.jwt.claims rather than reading auth, deliberately, so
-- it needs no grant on that schema (see 0003, which cannot even rely on
-- `grant usage on schema auth`). The claim is set by PostgREST from the
-- verified JWT and is no more forgeable than `sub` is.
--
-- FAIL OPEN ON A MISSING CLAIM, ON PURPOSE. Only an explicit `true` is
-- rejected. Older GoTrue releases omit is_anonymous entirely, and treating an
-- absent claim as anonymous would lock out every real player on the next auth
-- upgrade — a self-inflicted outage in exchange for nothing, since a project
-- with the toggle off mints no anonymous identities to catch.
--
-- SECOND, UNRELATED FIX IN THE SAME FILE: the display-name collision loop.
-- Anonymous users have no name metadata, so every one derives 'Driver' and
-- enters handle_new_user's `while exists` loop. The Nth does N sequential
-- lookups before landing on 'Driver<N>', capped at 999 tries. That is a real
-- amplifier — but it is NOT anonymous-specific and does not go away when the
-- toggle does: magic-link signup sends no given_name either, so every
-- magic-link player without a driver_name also derives 'Driver'. The loop is
-- bounded below at 7 lookups.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. submit_score: an anonymous identity is not a player.
--
--    Rewritten whole rather than patched, because create or replace needs the
--    full body and a partial redefinition is how a hardening step quietly
--    reverts an earlier one. This is 0012's function verbatim plus the block
--    marked THE FIX — diff it against 0012 to confirm nothing else moved.
-- ---------------------------------------------------------------------
create or replace function public.submit_score(
  p_track_version   text,
  p_sim_version     text,
  p_race_ms         integer,
  p_best_lap_ms     integer,
  p_finish_position smallint,
  p_trace_key       text default null   -- IGNORED. See 0012.
)
returns table (improved boolean, best_race_ms integer, board_rank bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_claims jsonb;
  v_anon   boolean;
  v_prev   integer;
  v_impr   boolean := false;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  begin
    v_uid := nullif(v_claims ->> 'sub', '')::uuid;
  exception when others then
    v_uid := null;
  end;

  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  /* THE FIX. Explicit true only — see the header on failing open. */
  begin
    v_anon := (v_claims ->> 'is_anonymous')::boolean;
  exception when others then
    v_anon := null;
  end;

  if coalesce(v_anon, false) then
    raise exception 'anonymous identities cannot post scores'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'no profile for this account' using errcode = '23503';
  end if;

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

-- Ownership and grants are not inherited by `create or replace` on a function
-- that is being redefined by a different role, so restate them. Identical to
-- 0012 — restated, not changed.
alter function public.submit_score(text, text, integer, integer, smallint, text)
  owner to score_writer;
revoke all on function public.submit_score(text, text, integer, integer, smallint, text) from public, anon;
grant execute on function public.submit_score(text, text, integer, integer, smallint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Bound the collision loop.
--
--    0011's version, unchanged except for the loop at the end. Every name
--    behaviour it fixed is preserved and is asserted by test/migrations.sh:
--    José G., 田中 太., Мария И., محمد, 'A & B <script>' -> 'A B S.', and the
--    bare-metadata fallback to Driver.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first  text;
  v_last   text;
  v_handle text;
  v_base   text;
  v_try    int := 0;
  v_optin  boolean;
  c_illegal constant text := '[^[:alpha:][:digit:] ''._-]';
begin
  v_first := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'given_name',
    split_part(coalesce(new.raw_user_meta_data ->> 'full_name',
                        new.raw_user_meta_data ->> 'name', ''), ' ', 1)
  )), '');
  v_last := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'family_name',
    nullif(split_part(coalesce(new.raw_user_meta_data ->> 'full_name',
                               new.raw_user_meta_data ->> 'name', ''), ' ', 2), '')
  )), '');

  v_first := nullif(trim(regexp_replace(
               regexp_replace(coalesce(v_first, ''), c_illegal, '', 'g'),
               '\s+', ' ', 'g')), '');
  v_last  := nullif(trim(regexp_replace(
               regexp_replace(coalesce(v_last, ''), c_illegal, '', 'g'),
               '\s+', ' ', 'g')), '');

  v_handle := nullif(trim(regexp_replace(
                regexp_replace(coalesce(new.raw_user_meta_data ->> 'driver_name', ''),
                               c_illegal, '', 'g'),
                '\s+', ' ', 'g')), '');

  if v_handle is null then
    if v_first is null then      v_handle := 'Driver';
    elsif v_last is null then    v_handle := v_first;
    else                         v_handle := v_first || ' ' || upper(left(v_last, 1)) || '.';
    end if;
  end if;

  v_handle := left(v_handle, 24);
  if char_length(v_handle) < 2 then v_handle := 'Driver'; end if;

  if v_handle !~ '^[[:alpha:][:digit:] ''._-]+$' then
    v_handle := 'Driver';
  end if;

  /* THE FIX. The old loop incremented a counter one at a time and re-queried
     each step, so the Nth holder of a popular base name cost N round trips and
     could reach 999. Five sequential tries keep the pleasant behaviour for the
     ordinary case — the second Jamie E. becomes Jamie E.1 — and anything
     beyond that jumps straight to a per-user suffix that will not collide.

     md5 of the user id, not random: the retries have to differ from each other
     (or the loop spins on the same candidate), but they must also be stable
     for a given signup so a retried insert lands on the same name. Hex is
     alphanumeric, so it satisfies display_name_chars by construction, and
     10 + 10 = 20 characters stays inside display_name_len.

     The backstop exit is not expected to be reachable — it is here so that a
     bug in the candidate generator can never become an unbounded loop inside
     a signup trigger. */
  v_base := left(v_handle, 20);
  loop
    exit when not exists (
      select 1 from public.profiles p
       where lower(p.display_name) = lower(v_handle)
    );
    v_try := v_try + 1;
    if v_try <= 5 then
      v_handle := v_base || v_try::text;
    else
      v_handle := left(v_base, 10) || substr(md5(new.id::text || v_try::text), 1, 10);
    end if;
    exit when v_try > 12;
  end loop;

  insert into public.profiles (user_id, display_name)
  values (new.id, v_handle)
  on conflict (user_id) do nothing;

  begin
    v_optin := coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false);
    insert into private.player_pii (user_id, email, first_name, last_name,
                                    marketing_opt_in, marketing_opt_in_at)
    values (new.id, coalesce(new.email, ''),
            nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name',  '')), ''),
            nullif(trim(coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
            v_optin,
            case when v_optin then now() else null end)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'player_pii insert skipped for %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- Confirm.
--
-- NOTE ON WHAT IS *NOT* RUN HERE. Two obvious checks belong in this section
-- and are deliberately left as comments, because both abort the migration:
--
--   select ... from auth.users where is_anonymous
--     — test/migrations.sh stands in a minimal auth.users with no such column,
--       so this fails on the harness rather than on Supabase. The behavioural
--       assertions in that script cover the guard instead.
--
--   select public.submit_score(...)
--     — raises by design when there is no JWT, and every migration is applied
--       with ON_ERROR_STOP=1. A confirm query that reliably aborts the file it
--       is in is worse than no confirm query.
--
-- Run these two BY HAND against the live project, with the service role:
--
--   -- the audit identity minted while proving this finding, plus anything
--   -- else anonymous predating the fix. Expected: one row, 'Driver'.
--   -- It was 'Driver' and not 'Driver1', which is itself the evidence that
--   -- no anonymous identity had ever been created before — the collision
--   -- loop would have suffixed it otherwise.
--   select u.id, p.display_name, u.created_at
--     from auth.users u left join public.profiles p on p.user_id = u.id
--    where u.is_anonymous order by u.created_at;
--
--   -- then, once inspected. Cascade takes the profile and the PII row.
--   delete from auth.users where is_anonymous;
-- ---------------------------------------------------------------------

-- The guard is present in the deployed body. Expect one row, `t`.
select proname,
       prosrc like '%anonymous identities cannot post scores%' as rejects_anonymous
  from pg_proc where proname = 'submit_score';

-- Ownership and search_path survived the redefinition. Expect score_writer
-- and a pinned empty search_path on both functions.
select p.proname, pg_get_userbyid(p.proowner) as owner, p.proconfig::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('submit_score', 'handle_new_user');
