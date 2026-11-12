#!/bin/bash
# Fresh database → shim → all migrations + seed → db_test.py.  Usage: bash supabase/tests/run_db_tests.sh [port]
set -e
PORT=${1:-5499}; HERE=$(cd "$(dirname "$0")/.." && pwd)
P="psql -q -v ON_ERROR_STOP=1 -h /tmp -p $PORT -U postgres"
$P -d postgres -c "drop database if exists bodhin" -c "create database bodhin" 2>&1 | grep -v NOTICE || true
for f in tests/supabase_shim.sql migrations/0001_tables.sql migrations/0002_rules.sql migrations/0003_security.sql seed.sql migrations/0004_refunds_and_listing.sql migrations/0005_live.sql migrations/0006_playground.sql; do $P -d bodhin -f "$HERE/$f" 2>&1 | grep -v NOTICE || true; done
python3 "$HERE/tests/db_test.py" "host=/tmp port=$PORT user=postgres dbname=bodhin"
