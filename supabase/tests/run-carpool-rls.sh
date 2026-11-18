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
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/carpool_rls.sql"
