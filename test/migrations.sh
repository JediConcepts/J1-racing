#!/usr/bin/env bash
#
# Applies every migration to a throwaway PostgreSQL cluster and asserts the
# security properties they are supposed to produce.
#
# WHY THIS EXISTS: the README and the migration headers make strong claims about
# the security model — PII unreachable, no client write path, a player can only
# rename themselves, the board is data-minimised. Before this, the only evidence
# for any of it was a session in which someone checked by hand and then deleted
# the database. An unreproducible verification is barely a verification: nobody
# else can run it, and neither can you in a month.
#
# NEEDS PostgreSQL 15 OR LATER. The leaderboard view uses `security_invoker`,
# which does not exist before 15 — on 14 the CREATE VIEW fails with
# "unrecognized parameter", 0001 and 0003 abort, and the seeds then fail on a
# foreign key because the profile trigger was never installed. That cascade is
# an artefact of the wrong server version and not a defect; this script refuses
# to run rather than let anyone read it as one.
#
#   ./test/migrations.sh
#
# Exits non-zero on the first failed assertion.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- find a server new enough -----------------------------------------------
PGBIN=""
for c in /opt/homebrew/Cellar/postgresql@1[5-9]/*/bin /opt/homebrew/Cellar/postgresql@2*/*/bin \
         /usr/lib/postgresql/1[5-9]/bin /usr/local/opt/postgresql@1[5-9]/bin; do
  [ -x "$c/initdb" ] || continue
  v="$("$c/initdb" --version | grep -oE '[0-9]+' | head -1)"
  if [ "${v:-0}" -ge 15 ]; then PGBIN="$c"; break; fi
done
if [ -z "$PGBIN" ]; then
  echo "FATAL: no PostgreSQL 15+ found. The leaderboard view needs security_invoker."
  echo "       brew install postgresql@17   (or apt install postgresql-17)"
  exit 2
fi
echo "server: $("$PGBIN/initdb" --version)"

# Short socket path: the default runtime dir blows the 103-byte sockaddr limit.
DATA="$(mktemp -d /tmp/mcl64pg.XXXXXX)/data"
SOCK="$(mktemp -d /tmp/mcl64sk.XXXXXX)"
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1; rm -rf "$DATA" "$SOCK"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$DATA" -E UTF8 --locale=en_US.UTF-8 -U postgres >/dev/null 2>&1 \
  || { echo "FATAL: initdb failed"; exit 2; }
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l "$DATA/log" start >/dev/null 2>&1
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -h "$SOCK" -U postgres >/dev/null 2>&1 && break; sleep 1; done

psql() { "$PGBIN/psql" -h "$SOCK" -U postgres -X -q "$@"; }
q()    { psql -tA -c "$1" 2>&1; }

# --- stand in for what Supabase provides ------------------------------------
psql -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1 || { echo "FATAL: prelude failed"; exit 2; }
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid;
$$;
grant usage on schema public to anon, authenticated, service_role;
SQL

# --- apply every migration --------------------------------------------------
fails=0
for f in "$REPO"/supabase/migrations/*.sql; do
  if out="$(psql -v ON_ERROR_STOP=1 -f "$f" 2>&1)"; then
    printf '  applied  %s\n' "$(basename "$f")"
  else
    printf '  FAILED   %s\n' "$(basename "$f")"
    echo "$out" | grep -E '^psql.*ERROR' | head -2 | sed 's/^/           /'
    fails=$((fails+1))
  fi
done
[ "$fails" -eq 0 ] || { echo; echo "FATAL: $fails migration(s) failed to apply"; exit 1; }

# 0001 creates the trigger after the view; install it the same way Supabase would.
q "create trigger on_auth_user_created after insert on auth.users
     for each row execute function public.handle_new_user();" >/dev/null

# --- assertions -------------------------------------------------------------
pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n         got: %s\n' "$1" "$2"; fail=$((fail+1)); }
is()   { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2 (wanted $3)"; fi; }
has()  { case "$2" in *"$3"*) ok "$1";; *) bad "$1" "$2";; esac; }

echo; echo "signup — names that used to break it (0011)"
q "insert into auth.users (id,email,raw_user_meta_data) values
   (gen_random_uuid(),'accent@t.test','{\"given_name\":\"José\",\"family_name\":\"García\"}'),
   (gen_random_uuid(),'cjk@t.test','{\"full_name\":\"田中 太郎\"}'),
   (gen_random_uuid(),'cyr@t.test','{\"given_name\":\"Мария\",\"family_name\":\"Иванова\"}'),
   (gen_random_uuid(),'arab@t.test','{\"given_name\":\"محمد\"}'),
   (gen_random_uuid(),'xss@t.test','{\"given_name\":\"A & B\",\"family_name\":\"<script>\"}'),
   (gen_random_uuid(),'empty@t.test','{}');" >/dev/null
is "accented name survives"      "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='accent@t.test'")" "José G."
is "CJK name survives"           "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='cjk@t.test'")" "田中 太."
is "Cyrillic name survives"      "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='cyr@t.test'")" "Мария И."
is "Arabic name survives"        "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='arab@t.test'")" "محمد"
is "markup stripped, not stored" "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='xss@t.test'")" "A B S."
is "no metadata falls back"      "$(q "select display_name from public.profiles p join auth.users u on u.id=p.user_id where u.email='empty@t.test'")" "Driver"
is "no display_name has markup"  "$(q "select count(*) from public.profiles where display_name ~ '[<>&\"/\\\\]'")" "0"

echo; echo "circuits (0012)"
is "track_versions exists"       "$(q "select count(*) from public.track_versions")" "3"
UID1="$(q "select user_id from public.profiles limit 1")"

# Set the JWT claim through a DO block, not `select set_config(...)`. The select
# form returns the value it set, so every assertion below would compare against
# that row plus the real answer stuck together — which is exactly how this
# harness first "found" five failures that were its own.
claim_as() { printf "do \$\$ begin perform set_config('request.jwt.claims','{\"sub\":\"%s\"}',false); end \$\$;" "$1"; }
CLAIM="$(claim_as "$UID1")"
has "known circuit accepted"     "$(q "$CLAIM select improved from public.submit_score('silverstone-v1','sim-2',300000,95000,1::smallint)")" "t"
has "trailing-space rejected"    "$(q "$CLAIM select * from public.submit_score('silverstone-v1 ','sim-2',300000,95000,1::smallint)")" "unknown track_version"
has "invented circuit rejected"  "$(q "$CLAIM select * from public.submit_score('monaco-v9','sim-2',300000,95000,1::smallint)")" "unknown track_version"
has "implausible time rejected"  "$(q "$CLAIM select * from public.submit_score('silverstone-v1','sim-2',1000,900,1::smallint)")" "implausible"

echo; echo "trace key is not the caller's (0012)"
q "$CLAIM select public.submit_score('brands-hatch-v1','sim-2',310000,95000,1::smallint,'someone-elses/trace.bin')" >/dev/null
is "caller-supplied key ignored"  "$(q "select count(*) from public.scores where trace_key is not null")" "0"

echo; echo "anonymous surface (0013)"
is "anon reads the board"         "$(q "set role anon; select case when count(*)>0 then 'rows' else 'empty' end from public.leaderboard")" "rows"
has "anon cannot read profiles"   "$(q "set role anon; select count(*) from public.profiles")" "permission denied"
has "anon cannot read scores"     "$(q "set role anon; select count(*) from public.scores")" "permission denied"
has "anon cannot read runs"       "$(q "set role anon; select count(*) from public.runs")" "permission denied"
has "anon cannot write scores"    "$(q "set role anon; insert into public.scores (user_id,race_ms,best_lap_ms,finish_position,track_version,sim_version) values ('$UID1',1,1,1,'silverstone-v1','x')")" "permission denied"
has "anon cannot call submit"     "$(q "set role anon; select public.submit_score('silverstone-v1','x',300000,95000,1::smallint)")" "permission denied"
is "anon reads track_versions"    "$(q "set role anon; select count(*) from public.track_versions")" "3"
is "board hides user_id"          "$(q "select count(*) from information_schema.columns where table_name='leaderboard' and column_name='user_id'")" "0"
is "board exposes 9 columns"      "$(q "select count(*) from information_schema.columns where table_name='leaderboard'")" "9"
is "view reads as owner"          "$(q "select coalesce(array_to_string(reloptions,','),'none') from pg_class where relname='leaderboard'")" "security_invoker=false"

echo; echo "authenticated surface (0013)"
AUTHCLAIM="$CLAIM set role authenticated;"
is "sees only own profile row"    "$(q "$AUTHCLAIM select count(*) from public.profiles")" "1"
is "that row is its own"          "$(q "$AUTHCLAIM select user_id from public.profiles")" "$UID1"
has "cannot read scores"          "$(q "$AUTHCLAIM select count(*) from public.scores")" "permission denied"
is "can still read the board"     "$(q "$AUTHCLAIM select case when count(*)>0 then 'rows' else 'empty' end from public.leaderboard")" "rows"
is "name check still works"       "$(q "$AUTHCLAIM select public.driver_name_available('Totally New Name')")" "t"
is "name check sees taken names"  "$(q "$AUTHCLAIM select public.driver_name_available('José G.')")" "f"

echo; echo "a player may rename only themselves (0009)"
UID2="$(q "select user_id from public.profiles where user_id <> '$UID1' limit 1")"
q "$AUTHCLAIM update public.profiles set display_name='Renamed By Me' where user_id='$UID1'" >/dev/null
is "own rename applies"           "$(q "select display_name from public.profiles where user_id='$UID1'")" "Renamed By Me"
BEFORE="$(q "select display_name from public.profiles where user_id='$UID2'")"
q "$AUTHCLAIM update public.profiles set display_name='Hijacked' where user_id='$UID2'" >/dev/null 2>&1
is "cannot rename anyone else"    "$(q "select display_name from public.profiles where user_id='$UID2'")" "$BEFORE"
has "cannot repoint own profile"  "$(q "$AUTHCLAIM update public.profiles set user_id='$UID2' where user_id='$UID1'")" "permission denied"

echo; echo "PII is out of reach (0001)"
has "anon cannot read PII"        "$(q "set role anon; select count(*) from private.player_pii")" "permission denied"
has "authenticated cannot either" "$(q "set role authenticated; select count(*) from private.player_pii")" "permission denied"
is "PII rows do exist"            "$(q "select case when count(*)>0 then 'yes' else 'no' end from private.player_pii")" "yes"
is "RLS forced on every table"    "$(q "select count(*) from pg_class where relname in ('profiles','scores','runs','player_pii') and not relforcerowsecurity")" "0"

echo; echo "score_writer is minimal (0003)"
is "nologin"                      "$(q "select rolcanlogin from pg_roles where rolname='score_writer'")" "f"
is "not superuser"                "$(q "select rolsuper from pg_roles where rolname='score_writer'")" "f"
is "no BYPASSRLS"                 "$(q "select rolbypassrls from pg_roles where rolname='score_writer'")" "f"
is "submit_score owned by it"     "$(q "select pg_get_userbyid(proowner) from pg_proc where proname='submit_score'")" "score_writer"
is "definers pin search_path"     "$(q "select count(*) from pg_proc where prosecdef and (proconfig is null or not proconfig::text like '%search_path=%')")" "0"

echo
printf 'assertions: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
echo "all good"
