-- Issue #824: polls in the Messages inbox.
--
-- This file only adds the enum value. A newly added enum value cannot be used
-- in the transaction that adds it and the CLI wraps each migration file in its
-- own transaction, so the tables, constraints, policies and RPCs that
-- reference 'poll' live in 20261125184907_admin_polls.sql.

ALTER TYPE public.admin_thread_type ADD VALUE IF NOT EXISTS 'poll';
