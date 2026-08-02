-- =====================================================================
-- Fix: changing your driver name appears to work, then reverts on next
-- sign-in.
--
-- 0001 did `revoke all on public.profiles from anon, authenticated` and then
-- granted only SELECT. The profiles_self_update RLS policy it also created
-- has therefore never once been consulted: GRANTs are evaluated BEFORE row
-- level security, so the UPDATE was refused a layer earlier than the policy.
--
-- The client updated its in-memory copy and showed the new name, which is why
-- it looked saved right up until the next sign-in reloaded the real row.
--
-- Fixed with a COLUMN-level grant rather than a table-level one: display_name
-- is the only thing a player has any business changing. user_id in particular
-- must stay untouchable, or someone could re-point their profile at another
-- account's scores.
-- =====================================================================

grant update (display_name) on public.profiles to authenticated;

-- The policy that grant finally lets through. Recreated rather than assumed,
-- since it has never actually been exercised.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The unique index from 0002 still applies, so a rename cannot take a name
-- somebody else already holds — it fails loudly rather than silently
-- suffixing, which is right for a deliberate change.

-- ---------------------------------------------------------------------
-- Confirm: authenticated should now show UPDATE(display_name) and SELECT,
-- and nothing else. anon should have SELECT only.
-- ---------------------------------------------------------------------
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles'
   and grantee in ('anon', 'authenticated')
   and privilege_type = 'UPDATE'
 order by grantee, column_name;

select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'profiles'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;
