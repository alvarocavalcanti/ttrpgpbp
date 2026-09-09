-- The admin user list aggregates a sender's messages (count + latest) per
-- user; this partial index lets that scan only live messages for a sender.
--
-- Standalone file: the pinned Supabase CLI (v2.111.0) runs `db reset` as a
-- pipeline, and CREATE INDEX CONCURRENTLY cannot run inside one, so it must be
-- the only statement in its own migration (matches 20260905175441).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_active
  ON public.messages (sender_id)
  WHERE NOT is_deleted;