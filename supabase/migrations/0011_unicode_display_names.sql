-- =====================================================================
-- Fix: nobody with an accent in their name can create an account.
--
-- handle_new_user() allowlist-strips the driver_name a player types, which is
-- correct. The FALLBACK path does not:
--
--   if v_handle is null then
--     ...
--     elsif v_last is null then v_handle := v_first;   -- straight through
--
-- v_first and v_last come from raw_user_meta_data (given_name, family_name,
-- full_name, name) with nothing but a trim. profiles.display_name carried
--   check (display_name ~ '^[A-Za-z0-9 ''._-]+$')
-- so a name with any character outside plain ASCII violated the constraint,
-- the trigger raised, and the signup failed. `on conflict (user_id) do
-- nothing` does not catch a CHECK violation, so nothing swallowed it.
--
-- signInWithProvider() sends no driver_name, so EVERY Google signup took that
-- fallback. José, Müller, Ana Sofía, and every name in Cyrillic, Greek, Arabic
-- or CJK could not sign up at all. Found by security review; it is not a
-- security hole — it failed closed, and the constraint did its job — but it
-- silently excluded most of the world.
--
-- TWO CHANGES, and the order of preference matters.
--
-- 1. Widen the constraint to admit Unicode LETTERS rather than transliterating
--    them away. José should be José, not Jose and certainly not Jos.
--    [[:alpha:]] is ctype-aware, and this database is UTF-8, so it matches
--    letters in every script. This stays an ALLOWLIST — it adds letters and
--    digits and nothing else. Every character that matters for HTML injection
--    is still excluded: < > & " / \ and all other punctuation.
--
--    That is deliberate. The XSS defence here is two independent layers —
--    this constraint and textContent at the sink in 40-game.js — and the fix
--    for a UX bug must not turn the allowlist into a denylist.
--
-- 2. Sanitise the fallback path with the same expression the typed name gets,
--    because an OAuth display name can still contain & or <, and then guard
--    the composed result so no signup can ever be blocked by a name again.
--
-- KNOWN TRADE-OFF, accepted: the unique index is on lower(display_name), and
-- Cyrillic "е" is not Latin "e", so visually identical names can coexist and
-- one player can imitate another on the board. Fixing that needs confusable
-- skeleton normalisation, which is a great deal of machinery for a leaderboard.
-- Noted rather than solved.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The constraint. Letters and digits in any script, space, and the four
--    punctuation marks a name legitimately needs: ' . _ -
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists display_name_chars;
alter table public.profiles add constraint display_name_chars
  check (display_name ~ '^[[:alpha:][:digit:] ''._-]+$');

-- ---------------------------------------------------------------------
-- 2. The trigger. Same allowlist applied to every source of a name, not just
--    the typed one.
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

  /* One definition of "legal", used for every candidate below. It must stay
     identical to display_name_chars above and to driver_name_available().
     Stripping a character leaves the gap it sat in — "A & B" becomes "A  B" —
     so every use of this is followed by collapsing runs of whitespace, or a
     sanitised name ends up looking like a typo. */
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

  /* THE FIX. These two are provider-supplied and were previously used raw. */
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

  /* Belt and braces. Everything above should already guarantee this, but a
     signup must never fail because of what someone is called — if the handle
     is still not legal, take the generic one rather than raising. */
  if v_handle !~ '^[[:alpha:][:digit:] ''._-]+$' then
    v_handle := 'Driver';
  end if;

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

  /* Optional by comparison — never let it take the profile down with it.
     Note the PII columns are intentionally NOT sanitised: this table is in a
     schema PostgREST does not expose, has every privilege revoked, has RLS
     forced with zero policies, and is never rendered anywhere. Storing the
     real name is the entire point of it. */
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
-- 3. Keep the availability check honest. 0002 says this function "cannot
--    disagree with the CHECK constraint about what is legal" — so widening
--    the constraint without widening this would make it lie, rejecting a
--    name the database would have accepted.
-- ---------------------------------------------------------------------
create or replace function public.driver_name_available(p_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select char_length(trim(p_name)) between 2 and 24
     and trim(p_name) ~ '^[[:alpha:][:digit:] ''._-]+$'
     and not exists (
       select 1 from public.profiles
        where lower(display_name) = lower(trim(p_name))
     );
$$;

revoke all on function public.driver_name_available(text) from public;
grant execute on function public.driver_name_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Confirm. The first four must be true, the last four false.
-- ---------------------------------------------------------------------
select public.driver_name_available('José')            as accents_ok,
       public.driver_name_available('Мария')           as cyrillic_ok,
       public.driver_name_available('田中')             as cjk_ok,
       public.driver_name_available('O''Neill')        as apostrophe_ok,
       public.driver_name_available('<script>')        as angle_rejected,
       public.driver_name_available('a&b')             as amp_rejected,
       public.driver_name_available('a/b')             as slash_rejected,
       public.driver_name_available('x')               as too_short_rejected;

-- And that the constraint agrees.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.profiles'::regclass
   and conname = 'display_name_chars';
