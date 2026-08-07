-- =====================================================================
-- MCL-64 global leaderboard
--   * public read, zero PII exposure
--   * scores writable ONLY by the validator, never by a client
--   * race results under full race conditions (6-car field, 3 laps)
--
-- SUPERSEDED IN PART BY 0003. Read that file before trusting item 5 below.
--   This header describes the design as intended. 0003 ships what actually
--   exists: the write path is a SECURITY DEFINER function, not an Edge
--   Function, and the re-simulating validator does not exist yet — so a
--   determined player who reads the JS can still submit an invented time.
--   Every row lands validated = false and stores its trace precisely so
--   those runs can be re-checked and purged once the validator lands.
--   Items 1 to 4 are accurate as written.
--
-- Shape of the defence, outermost first:
--   1. PII lives in a schema PostgREST does not expose at all.
--   2. GRANTs are revoked. These are checked BEFORE RLS and are not
--      bypassed by BYPASSRLS roles, so they are a genuinely separate layer.
--   3. RLS is ENABLED and FORCED. Without FORCE, the table owner silently
--      bypasses every policy.
--   4. RESTRICTIVE policies that no future permissive policy can override.
--   5. There is NO client-reachable write path at all. Scores appear only
--      after the validator has re-simulated the submitted trace, so the
--      Edge Function writes them with the service role. A player cannot
--      hand the database a score under any circumstances.
--      ^ ASPIRATIONAL. See the note above.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PII, out of reach
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.player_pii (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  first_name       text,
  last_name        text,
  -- Marketing consent is separate from account creation on purpose: under UK
  -- GDPR it must be a positive opt-in, not a side effect of signing up.
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  created_at       timestamptz not null default now()
);

revoke all on private.player_pii from public, anon, authenticated;
alter table private.player_pii enable row level security;
alter table private.player_pii force row level security;
-- Deliberately ZERO policies: nothing reachable from the API can read this.

-- ---------------------------------------------------------------------
-- 2. Public identity. No PII by construction.
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  -- "Jamie E." — derived once at signup and stored, never derived at read
  -- time from a table that also holds the real surname. The period is why
  -- the character class below is wider than you might expect.
  display_name text not null
    constraint display_name_len   check (char_length(display_name) between 2 and 24)
    constraint display_name_chars check (display_name ~ '^[A-Za-z0-9 ''._-]+$'),
  country_code text constraint country_code_iso check (country_code ~ '^[A-Z]{2}$'),
  created_at   timestamptz not null default now()
);

-- NOTE: display_name is deliberately NOT unique. It is a label, not an
-- identity — two real players called Jamie E. must both be able to exist.
create index profiles_display_name_idx on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------
-- 3. Runs: a server-issued, single-use ticket for one race attempt.
--    Never readable or writable by a client.
-- ---------------------------------------------------------------------
create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  track_version text not null,
  sim_version   text not null,        -- physics build; invalidates old traces
  ai_seed       bigint not null,      -- canonical opposition for this run
  issued_at     timestamptz not null default now(),
  consumed_at   timestamptz,          -- set on first finish; enforces single use
  client_meta   jsonb
);
create index runs_user_issued_idx on public.runs (user_id, issued_at desc);

-- ---------------------------------------------------------------------
-- 4. Scores: only ever written by the validator.
-- ---------------------------------------------------------------------
create table public.scores (
  id              bigint generated always as identity primary key,
  run_id          uuid not null unique references public.runs(id) on delete cascade,
  user_id         uuid not null references public.profiles(user_id) on delete cascade,
  race_ms         integer not null constraint race_plausible check (race_ms between 60000 and 1800000),
  best_lap_ms     integer not null constraint lap_plausible  check (best_lap_ms between 20000 and 600000),
  -- 33, not 32: the Indianapolis 500 starts 33 cars. The original 32 silently
  -- broke 0010, whose Indy seed ends on P33 — see 0014, which widens this on
  -- databases that already have the narrow version.
  finish_position smallint not null check (finish_position between 1 and 33),
  track_version   text not null,
  sim_version     text not null,
  validated       boolean not null default false,
  trace_key       text,               -- R2/storage object holding the input trace
  created_at      timestamptz not null default now()
);

-- One personal best per player per track version. A faster run replaces it.
create unique index scores_personal_best on public.scores (user_id, track_version);
create index scores_board_idx on public.scores (track_version, race_ms, created_at)
  where validated;

-- ---------------------------------------------------------------------
-- 5. GRANTs — the outer gate, evaluated before RLS.
--    Supabase hands anon/authenticated full DML on new public tables by
--    default, so these REVOKEs are load-bearing rather than decorative.
-- ---------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
revoke all on public.scores   from anon, authenticated;
revoke all on public.runs     from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant select on public.scores   to anon, authenticated;
-- runs: no client grant at all, in any form.

-- Default privileges also expose identity SEQUENCES, which leak row counts
-- and insert rates through last_value. Take those back too.
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS — the row gate
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.scores   enable row level security;
alter table public.runs     enable row level security;

alter table public.profiles force row level security;
alter table public.scores   force row level security;
alter table public.runs     force row level security;

create policy profiles_public_read on public.profiles
  for select to anon, authenticated using (true);

create policy scores_public_read on public.scores
  for select to anon, authenticated using (validated);

-- runs has NO policies whatsoever => default deny for every role.

-- Belt and braces. RESTRICTIVE policies AND together with everything else,
-- so no permissive policy added later can accidentally re-open writes.
create policy scores_no_client_insert on public.scores
  as restrictive for insert to anon, authenticated with check (false);
create policy scores_no_client_update on public.scores
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy scores_no_client_delete on public.scores
  as restrictive for delete to anon, authenticated using (false);

-- A player may edit their own display name, nothing else.
create policy profiles_self_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 7. The public projection. security_invoker means the caller's own
--    privileges and the base tables' RLS still apply — nothing is
--    silently bypassed by the view.
-- ---------------------------------------------------------------------
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
  s.created_at
from public.scores s
join public.profiles p on p.user_id = s.user_id
where s.validated;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. New account -> public profile + private PII.
--    display_name is derived here: first name plus surname initial.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text;
  v_last  text;
  v_name  text;
begin
  -- Google gives given_name/family_name; Apple gives them only on FIRST
  -- authorisation; magic link gives neither. Fall back gracefully.
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

  if v_first is null then
    v_name := 'Driver';                       -- magic-link users rename later
  elsif v_last is null then
    v_name := v_first;
  else
    v_name := v_first || ' ' || upper(left(v_last, 1)) || '.';
  end if;

  insert into public.profiles (user_id, display_name)
  values (new.id, left(v_name, 24));

  insert into private.player_pii (user_id, email, first_name, last_name)
  values (new.id, coalesce(new.email, ''), v_first, v_last);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
