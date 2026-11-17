-- #808: the admin console's Active Channels rule gains a 14-day window.
--
-- Before this, human_sender_count / human_message_count counted lifetime
-- activity, so a game that met the thresholds last month and has been silent
-- since still read as "active". The card is a liveness signal, so both gates
-- now apply inside the last 14 days:
--
--   >= 2 distinct human senders AND >= 15 non-system human messages,
--   both within the last 14 days.
--
-- These two columns are consumed only by AdminView's isActiveChannel() (the
-- Active Channels card and its filter); they are never rendered as a table
-- column, so no displayed figure changes meaning. Keep this in sync with the
-- usage-report skill's RECENT_WINDOW variant.
--
-- Human = sender_id IS NOT NULL AND type <> 'system'; soft-deleted rows still
-- count (they were activity when posted). now() is the transaction timestamp,
-- which is what a STABLE function should use.
--
-- The body below is the current definition
-- (20261016140251_admin_list_channels_takedown_marker.sql) with the window
-- added to the activity lateral. The return type is unchanged, so this could be
-- CREATE OR REPLACE, but the drop-and-restate form keeps the ACLs visible
-- alongside the definition, matching the previous two revisions.

DROP FUNCTION public.admin_list_channels();

CREATE FUNCTION public.admin_list_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  gm_id UUID,
  member_count BIGINT,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  gm_display_name TEXT,
  human_sender_count BIGINT,
  human_message_count BIGINT,
  join_mode public.channel_join_mode,
  pending_request_count BIGINT,
  listing_takedown_at TIMESTAMPTZ,
  description TEXT,
  constraints TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT c.id, c.name, c.game_system, c.gm_id,
      COALESCE(m.members, 0) AS member_count,
      c.created_at,
      c.last_message_at,
      gm.display_name AS gm_display_name,
      COALESCE(a.senders, 0) AS human_sender_count,
      COALESCE(a.messages, 0) AS human_message_count,
      c.join_mode,
      COALESCE(p.pending, 0) AS pending_request_count,
      c.listing_takedown_at,
      c.description,
      c.constraints
    FROM channels c
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS members
      FROM channel_members cm
      WHERE cm.channel_id = c.id
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT msg.sender_id) AS senders, COUNT(*) AS messages
      FROM messages msg
      WHERE msg.channel_id = c.id
        AND msg.sender_id IS NOT NULL
        AND msg.type <> 'system'
        AND msg.created_at >= now() - interval '14 days'
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pending
      FROM channel_join_requests cjr
      WHERE cjr.channel_id = c.id AND cjr.status = 'pending'
    ) p ON true
    WHERE NOT c.is_archived
    ORDER BY c.created_at DESC;
END;
$$;

-- Restated after the drop (matching 20261016140251).
REVOKE ALL ON FUNCTION public.admin_list_channels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_channels() TO authenticated, service_role;
