-- =====================================================================
-- Las Vegas joins the board.
--
-- public.track_versions is the allow-list a score is checked against
-- (0012), and 0016 exists because Monaco shipped in the client's TRACKS
-- without a row here: every Monaco lap was rejected with
--
--   unknown track_version: monaco-gp-v1
--
-- and the board stayed empty with nothing anywhere saying why.
--
-- Las Vegas (las-vegas-v1, src/20-track.js) is added to the client with
-- `board: false` on its TRACKS entry, so the game posts no Las Vegas result
-- and tells the player there is no leaderboard for the circuit yet. That
-- holds until this migration is applied. Applying it is a decision for the
-- owner of the live database, and is the first of two steps:
--
--   1. apply this migration;
--   2. delete `board: false` from the las-vegas-v1 entry in TRACKS and ship.
--
-- In that order. The other way round, every Las Vegas post fails exactly as
-- Monaco's did.
--
-- Idempotent, like 0012's seed and 0016: it runs against a live database
-- that already has the other four circuits.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The new circuit.
-- ---------------------------------------------------------------------
insert into public.track_versions (id, label) values
  ('las-vegas-v1', 'Las Vegas')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Assert it, rather than trusting that an insert which ran must have
--    worked (see 0014 and 0016). If the row is not there afterwards, the
--    migration fails loudly.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.track_versions where id = 'las-vegas-v1') then
    raise exception 'las-vegas-v1 missing from track_versions after seeding';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. What the board should now show: five circuits, Las Vegas with no
--    entries yet. test/migrations.sh checks that every id in
--    src/20-track.js has a row here.
-- ---------------------------------------------------------------------
select t.id, t.label, count(s.user_id) as entries
  from public.track_versions t
  left join public.scores s on s.track_version = t.id
 group by t.id, t.label
 order by t.id;
