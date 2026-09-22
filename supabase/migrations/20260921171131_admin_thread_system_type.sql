-- Issue #562 P1: the server admin gets a single "System" thread in /messages
-- where safety alerts (CSAM matches, abuse reports) arrive. This file only
-- adds the enum value: a newly added enum value cannot be *used* in the same
-- transaction, and the CLI wraps each migration file in its own transaction,
-- so the schema/policies/functions that reference 'system' live in the next
-- file (system_message_thread).

ALTER TYPE public.admin_thread_type ADD VALUE IF NOT EXISTS 'system';
