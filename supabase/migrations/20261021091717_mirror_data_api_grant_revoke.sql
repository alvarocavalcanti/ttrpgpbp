-- Mirror Supabase's Data API default-grant change (2026-10-30) locally.
--
-- Supabase stops granting SELECT/INSERT/UPDATE/DELETE on new public tables to
-- anon/authenticated/service_role through the postgres role's default
-- privileges. This repo leaned on ALTER DEFAULT PRIVILEGES
-- (20260905195245_add_table_dml_grants, 20260907115918_grant_service_role_table_dml)
-- to cover tables created by later migrations. The platform change deletes
-- exactly those default ACL entries, so a table added after 2026-10-30 would be
-- unreachable through the Data API in the hosted project while local resets
-- (which re-apply the defaults) stayed green.
--
-- Applying the same revoke here keeps local, CI and hosted in agreement: from
-- now on every table/view created in public needs explicit GRANTs in the same
-- migration that creates it (see AGENTS.md, "Database Migrations").
--
-- Scope matches the platform statement exactly:
--   * tables: SELECT, INSERT, UPDATE, DELETE revoked. TRUNCATE, REFERENCES,
--     TRIGGER and MAINTAIN stay, as they do on hosted after the rollout.
--   * sequences: USAGE, SELECT revoked.
--   * functions: untouched. EXECUTE defaults are pinned separately in
--     20260907200109_sec1_pin_default_function_privs and client RPCs depend
--     on them.
--
-- Existing objects keep their current grants, including deliberate revokes
-- (20260925163923_profiles_revoke_anon removes anon SELECT on profiles).
-- Never "fix" grants with a blanket GRANT ... ON ALL TABLES.
--
-- Scope: the postgres role, which owns everything the migrations create. The
-- platform role (supabase_admin) keeps its own defaults and cannot be changed
-- from postgres, so do not try.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;
