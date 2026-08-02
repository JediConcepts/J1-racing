-- =====================================================================
-- Fix: "no profile for this account" when posting a score.
--
-- submit_score refuses to write a row it cannot attribute to a profile, so a
-- signed-in user with no profiles row cannot post. That means
-- handle_new_user() did not complete for that account.
--
-- Most likely cause: the trigger's second insert targets private.player_pii,
-- which has FORCE ROW LEVEL SECURITY and ZERO policies by design. Under FORCE,
-- even a SECURITY DEFINER function owned by the table owner is subject to
-- policy — so unless the executing role holds BYPASSRLS that insert is
-- refused, the exception propagates, and the whole trigger rolls back,
-- destroying the profile insert that had already succeeded.
--
-- Two changes:
--   1. The profile becomes the part that must succeed. PII is written in its
--      own block, and a failure there is logged rather than fatal — losing an
--      optional email record must never cost someone their account.
--   2. Backfill every auth user that ended up with no profile.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Give the definer function a policy to write through, so the PII insert
--    stops depending on whether the executing role happens to have BYPASSRLS.
--    Still no SELECT policy: nothing can read this table through the API.
-- ---------------------------------------------------------------------
drop policy if exists player_pii_definer_insert on private.player_pii;
create policy player_pii_definer_insert on private.player_pii
  for insert to postgres with check (true);

-- ---------------------------------------------------------------------
-- 2. A trigger that cannot lose the profile.
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

  v_handle := nullif(regexp_replace(
                coalesce(new.raw_user_meta_data ->> 'driver_name', ''),
                '[^A-Za-z0-9 ''._-]', '', 'g'), '');
  v_handle := nullif(trim(v_handle), '');

  if v_handle is null then
    if v_first is null then      v_handle := 'Driver';
    elsif v_last is null then    v_handle := v_first;
    else                         v_handle := v_first || ' ' || upper(left(v_last, 1)) || '.';
    end if;
  end if;

  v_handle := left(v_handle, 24);
  if char_length(v_handle) < 2 then v_handle := 'Driver'; end if;

  v_base := v_handle;
  while exists (select 1 from public.profiles p
                 where lower(p.display_name) = lower(v_handle)) loop
    v_try := v_try + 1;
    v_handle := left(v_base, 20) || v_try::text;
    if v_try > 999 then
      v_handle := left(v_base, 12) || substr(replace(new.id::text, '-', ''), 1, 8);
      exit;
    end if;
  end loop;

  /* The account is worthless without this, so it stays outside the guard. */
  insert into public.profiles (user_id, display_name)
  values (new.id, v_handle)
  on conflict (user_id) do nothing;

  /* Optional by comparison — never let it take the profile down with it. */
  begin
    v_optin := coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false);
    insert into private.player_pii (user_id, email, first_name, last_name,
                                    marketing_opt_in, marketing_opt_in_at)
    values (new.id, coalesce(new.email, ''), v_first, v_last,
            v_optin, case when v_optin then now() else null end)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'player_pii insert skipped for %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Backfill anyone already stranded without a profile.
-- ---------------------------------------------------------------------
do $$
declare
  r        record;
  v_first  text;
  v_last   text;
  v_handle text;
  v_base   text;
  v_try    int;
  v_made   int := 0;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data as meta
      from auth.users u
      left join public.profiles p on p.user_id = u.id
     where p.user_id is null
     order by u.created_at
  loop
    v_first := nullif(trim(coalesce(
      r.meta ->> 'given_name',
      split_part(coalesce(r.meta ->> 'full_name', r.meta ->> 'name', ''), ' ', 1)
    )), '');
    v_last := nullif(trim(coalesce(
      r.meta ->> 'family_name',
      nullif(split_part(coalesce(r.meta ->> 'full_name', r.meta ->> 'name', ''), ' ', 2), '')
    )), '');

    v_handle := nullif(trim(nullif(regexp_replace(
                  coalesce(r.meta ->> 'driver_name', ''),
                  '[^A-Za-z0-9 ''._-]', '', 'g'), '')), '');

    if v_handle is null then
      if v_first is null then      v_handle := 'Driver';
      elsif v_last is null then    v_handle := v_first;
      else                         v_handle := v_first || ' ' || upper(left(v_last, 1)) || '.';
      end if;
    end if;

    v_handle := left(v_handle, 24);
    if char_length(v_handle) < 2 then v_handle := 'Driver'; end if;

    v_base := v_handle; v_try := 0;
    while exists (select 1 from public.profiles p
                   where lower(p.display_name) = lower(v_handle)) loop
      v_try := v_try + 1;
      v_handle := left(v_base, 20) || v_try::text;
      if v_try > 999 then
        v_handle := left(v_base, 12) || substr(replace(r.id::text, '-', ''), 1, 8);
        exit;
      end if;
    end loop;

    insert into public.profiles (user_id, display_name)
    values (r.id, v_handle)
    on conflict (user_id) do nothing;

    begin
      insert into private.player_pii (user_id, email, first_name, last_name)
      values (r.id, coalesce(r.email, ''), v_first, v_last)
      on conflict (user_id) do nothing;
    exception when others then
      raise warning 'player_pii backfill skipped for %: %', r.id, sqlerrm;
    end;

    v_made := v_made + 1;
    raise notice 'created profile "%" for %', v_handle, coalesce(r.email, r.id::text);
  end loop;

  raise notice 'backfilled % profile(s)', v_made;
end $$;

-- Confirm nobody is left stranded:
select count(*) as users_still_without_a_profile
  from auth.users u
  left join public.profiles p on p.user_id = u.id
 where p.user_id is null;
