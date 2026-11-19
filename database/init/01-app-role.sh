#!/bin/sh
# Runs once, on first initialisation of an EMPTY data volume (postgres image entrypoint).
# Creates the non-superuser application role and its database. Never runs against existing data.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" -v app_db="$APP_DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user', :'app_pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
SQL
