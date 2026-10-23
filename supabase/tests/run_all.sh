#!/bin/bash
# Usage: PGPORT=5433 ./supabase/tests/run_all.sh   (needs a local Postgres with the Supabase role shim)
set -u
H="-h ${PGHOST:-/tmp} -p ${PGPORT:-5433}"
D=$(dirname "$0")
psql $H -U postgres -d anora -q -f "$D/seed_extra.sql"
echo "== direct attack / regression suite =="; psql $H -U authenticator -d anora -f "$D/attack_suite.sql" 2>&1 | grep -E "\->"
psql $H -U authenticator -d anora -f "$D/batch2_test.sql" 2>&1 | grep -E "coupon|used_count|session|B2"
echo "== guard sweep over every wrapped RPC =="; psql $H -U authenticator -d anora -At -f "$D/guard_sweep.sql" 2>&1 | grep -E "SWEEP|FAIL"
