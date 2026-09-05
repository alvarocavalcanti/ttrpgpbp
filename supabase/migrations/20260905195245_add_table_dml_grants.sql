-- Table DML privileges for anon/authenticated.
--
-- Hosted Supabase projects grant SELECT/INSERT/UPDATE/DELETE on public tables
-- to these roles out of the box (row access is governed by RLS). The Supabase
-- CLI's `db reset` used to seed the same default privileges, but the version
-- pinned in CI (v2.111.0, kept for supabase link compatibility) leaves
-- freshly-reset tables without DML grants — every REST read/write then fails
-- with 42501 (permission denied for table ...). Make the local/CI reset
-- state explicit so it matches hosted behavior under any CLI version.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Keep future tables (created by later migrations) consistent too. Function
-- EXECUTE is deliberately NOT granted here: several hardening migrations
-- REVOKE it from PUBLIC and grant it only where needed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
