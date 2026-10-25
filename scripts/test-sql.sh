#!/usr/bin/env bash
# Aplica las migraciones en una base de datos Postgres local vacía y ejecuta
# los tests SQL. Uso: DATABASE_URL=postgres://... scripts/test-sql.sh
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL apuntando a una base de datos de pruebas vacía}"
cd "$(dirname "$0")/.."

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_entorno_local.sql
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
for f in supabase/tests/[1-9]*.sql; do
  echo "== $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Tests SQL superados."
