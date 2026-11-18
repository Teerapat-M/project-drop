#!/usr/bin/env bash
# Apply the Supabase shim + profiles + carpool migrations on an empty
# Postgres, then run supabase/tests/carpool_rls.sql with ON_ERROR_STOP.
# Used by CI (ephemeral service). Do not point this at the live drop project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"

psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/shim.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261110120000_profiles.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261118100000_carpool.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261118120000_carpool_trip_stops.sql"
# Legacy taxi 100×50×50 + private custom dims, then the C2.3 migration, then
# assert backfill/CHECK. Must run around the migration, not after carpool_rls.sql.
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/carpool_taxi_trunk_seed.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261118130000_carpool_taxi_trunk.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/carpool_taxi_trunk_backfill.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261118140000_carpool_c24_lows.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261118150000_carpool_c25_drop_admin_geo_reqs.sql"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/carpool_rls.sql"
