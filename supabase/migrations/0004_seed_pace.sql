-- =====================================================================
-- Pace-setters: a starting field so the board is not empty on day one.
--
-- Deliberately SLOW. The AI runs about 5:31, so every one of these sits
-- between 6:05 and 7:40 — a real player who finishes a clean race should
-- beat most of them immediately, which is the point.
--
-- These go through the normal signup path rather than being poked straight
-- into profiles: inserting into auth.users fires handle_new_user(), which
-- derives the display name and the PII row exactly as it would for a real
-- account. Nothing here is a special case.
--
-- Every address is on the .invalid TLD, which RFC 2606 reserves precisely so
-- it can never resolve — these accounts cannot receive a magic link and so
-- can never be signed into.
--
-- TO REMOVE THEM LATER (cascades to profiles, scores and PII):
--   delete from auth.users where email like '%@pace.invalid';
-- =====================================================================

do $$
declare
  v_id    uuid;
  v_names text[] := array[
    'Gravel Trap Gary', 'Backmarker Bob', 'Chicane Charlie', 'Rusty Bolt',
    'Late Braker Lou',  'Understeer Sue', 'Kerb Hopper Kim', 'Pit Lane Pete',
    'Oversteer Ollie',  'Slipstream Sid', 'Apex Annie',      'Doughnut Dave'
  ];
  v_race  int[] := array[365400, 372900, 381200, 389600, 397100, 404800,
                         412300, 419900, 428400, 436100, 443700, 459200];
  v_lap   int[] := array[118900, 121300, 124100, 126800, 129400, 131900,
                         134500, 137200, 139800, 142400, 145100, 149600];
  v_pos   int[] := array[3, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 6];
  i int;
begin
  for i in 1 .. array_length(v_names, 1) loop
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated',
      'pace' || i || '@pace.invalid',
      /* not a valid hash, and the address cannot receive mail — these
         accounts are unreachable by design */
      'seeded-no-login',
      now(), now() - ((13 - i) || ' days')::interval, now(),
      '{"provider":"seed","providers":["seed"]}'::jsonb,
      jsonb_build_object('driver_name', v_names[i]),
      false
    );

    /* handle_new_user() has now created the profile and the PII row. */

    insert into public.scores (
      user_id, race_ms, best_lap_ms, finish_position,
      track_version, sim_version, validated, created_at
    ) values (
      v_id, v_race[i], v_lap[i], v_pos[i]::smallint,
      'silverstone-v1', 'seed', false,
      now() - ((13 - i) || ' days')::interval
    );
  end loop;
end $$;

-- Sanity check: 12 pace-setters, slowest first past the post.
-- select display_name, race_ms, best_lap_ms from public.leaderboard
--  where track_version = 'silverstone-v1' order by rank;
