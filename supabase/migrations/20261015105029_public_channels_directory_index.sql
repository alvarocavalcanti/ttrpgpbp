-- #674 Phase A: directory listing index.
--
-- Its own single-statement migration: the Supabase CLI runs `db reset` as a
-- pipeline, and CREATE INDEX CONCURRENTLY cannot run inside one (see AGENTS.md
-- and 20260908170031_admin_user_details_sender_index.sql).
--
-- Backs the anonymous /directory and the signed-in Discover list, both of which
-- scan listed, non-archived channels ordered by recent activity. The column
-- ordering must match list_public_channels' ORDER BY (last_message_at DESC NULLS
-- LAST, created_at DESC): a DESC index column defaults to NULLS FIRST, which the
-- planner cannot use for the requested order.
CREATE INDEX CONCURRENTLY channels_public_directory_idx
  ON public.channels (last_message_at DESC NULLS LAST, created_at DESC)
  WHERE join_mode = 'approval' AND is_archived = false;
