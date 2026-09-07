-- Service-role DML parity for local/CI resets (issue #437 e2e seeding).
--
-- Hosted Supabase grants service_role SELECT/INSERT/UPDATE/DELETE on public
-- tables out of the box. The pinned CLI (v2.111.0, kept for `supabase link`
-- compatibility) leaves freshly-reset tables without grants for any role —
-- the reason 20260905195245 had to re-grant anon/authenticated explicitly.
-- service_role was not covered there, so the E2E spec that seeds a channel
-- through the service-role REST API (bypasses RLS, still needs table grants)
-- passed locally on newer CLIs but failed in CI with 42501. Mirror that
-- migration for service_role so reset state matches hosted behavior.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Keep future tables (created by later migrations) consistent too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;