-- =====================================================================
-- Monaco has been unpostable since it shipped.
--
-- 0012 created public.track_versions as the allow-list a score is checked
-- against, and seeded it from src/20-track.js — its own header says so:
-- "Ids come from src/20-track.js". At the time that file held three circuits.
-- Monaco was added to the client afterwards, first in the TRACKS array, and
-- no migration followed it. So the client offers four circuits and the
-- database accepts three.
--
-- What the player sees:
--
--   [MCL-64] score post failed: unknown track_version: monaco-gp-v1
--
-- raised by submit_score at the `not exists (select 1 from track_versions)`
-- guard. That guard is working exactly as designed — it is the registry that
-- is incomplete — which is why nothing here loosens it.
--
-- The failure shape is worth naming, because it is the same one 0014 ran
-- into. A rejected post is not a crash: the race finishes, the car parks, the
-- board simply never gains a row. Monaco is the FIRST entry in TRACKS, so it
-- is the circuit a curious player is most likely to try, and every one of
-- those laps was thrown away with a console line nobody was reading.
--
-- Idempotent, like 0012's own seed — this runs against a live database that
-- already has the other three.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The missing circuit.
-- ---------------------------------------------------------------------
insert into public.track_versions (id, label) values
  ('monaco-gp-v1', 'Monaco')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Assert it, rather than trusting that an insert which ran must have
--    worked. 0014 exists because a migration was run, its error scrolled
--    past, and the result looked plausible. This one refuses to end quietly:
--    if the row is not there afterwards, the migration fails loudly.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.track_versions where id = 'monaco-gp-v1') then
    raise exception 'monaco-gp-v1 missing from track_versions after seeding';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. What the board should now show. Four circuits, Monaco with no entries
--    yet — every attempt before this was rejected, and a rejected post
--    leaves nothing behind to backfill.
--
--    The client-side half of this — asserting that every id in
--    src/20-track.js has a row here — lives in test/migrations.sh, so the
--    next circuit added to TRACKS without a migration fails a test instead
--    of failing silently in a player's console.
-- ---------------------------------------------------------------------
select t.id, t.label, count(s.user_id) as entries
  from public.track_versions t
  left join public.scores s on s.track_version = t.id
 group by t.id, t.label
 order by t.id;
