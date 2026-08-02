-- =====================================================================
-- Driver name becomes a CHOSEN, UNIQUE handle.
--
-- 0001 deliberately left display_name non-unique, because a derived label
-- ("Jamie E.") collides legitimately between two real people. A chosen
-- handle is the opposite: it is an identity, so it must be unique. The
-- derived form survives only as a fallback for accounts that never picked
-- one — magic-link signups before this change, and OAuth users whose
-- provider gave us a name but no handle.
-- =====================================================================

-- Case-insensitive uniqueness: "Senna" and "senna" are the same driver.
drop index if exists public.profiles_display_name_idx;

-- Fold any pre-existing duplicates first, or the unique index cannot build.
with dupes as (
  select user_id,
         display_name,
         row_number() over (partition by lower(display_name) order by created_at, user_id) as n
    from public.profiles
)
update public.profiles p
   set display_name = left(d.display_name, 20) || d.n::text
  from dupes d
 where p.user_id = d.user_id
   and d.n > 1;

create unique index profiles_display_name_unique
  on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------
-- Signup: prefer the chosen handle, fall back to a derived label, and
-- guarantee uniqueness so a collision can never fail the whole signup.
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

  -- Chosen handle wins. Strip anything the CHECK constraint would reject
  -- rather than letting a stray character abort the signup.
  v_handle := nullif(regexp_replace(
                coalesce(new.raw_user_meta_data ->> 'driver_name', ''),
                '[^A-Za-z0-9 ''._-]', '', 'g'), '');
  v_handle := nullif(trim(v_handle), '');

  if v_handle is null then
    if v_first is null then          v_handle := 'Driver';
    elsif v_last is null then        v_handle := v_first;
    else                             v_handle := v_first || ' ' || upper(left(v_last, 1)) || '.';
    end if;
  end if;

  v_handle := left(v_handle, 24);
  if char_length(v_handle) < 2 then v_handle := 'Driver'; end if;

  -- The client checks availability as you type, but two people can still
  -- submit the same name in the same second. Suffix rather than fail:
  -- losing a signup over a name clash would be a terrible first impression.
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

  v_optin := coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false);

  insert into public.profiles (user_id, display_name)
  values (new.id, v_handle);

  insert into private.player_pii (user_id, email, first_name, last_name,
                                  marketing_opt_in, marketing_opt_in_at)
  values (new.id, coalesce(new.email, ''), v_first, v_last,
          v_optin, case when v_optin then now() else null end);

  return new;
end $$;

-- ---------------------------------------------------------------------
-- Availability check for the signup form.
--
-- Returns one boolean and validates the format server-side, so the client
-- cannot disagree with the CHECK constraint about what is legal.
-- Note this is convenience, not confidentiality: profiles stays publicly
-- readable because the leaderboard view joins it under security_invoker,
-- and driver names are published on that board anyway.
-- ---------------------------------------------------------------------
create or replace function public.driver_name_available(p_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select char_length(trim(p_name)) between 2 and 24
     and trim(p_name) ~ '^[A-Za-z0-9 ''._-]+$'
     and not exists (
       select 1 from public.profiles
        where lower(display_name) = lower(trim(p_name))
     );
$$;

revoke all on function public.driver_name_available(text) from public;
grant execute on function public.driver_name_available(text) to anon, authenticated;
