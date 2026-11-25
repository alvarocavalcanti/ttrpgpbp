-- Issue #788: admin view improvements.
--
-- 1. The server admin's read-only channel view needs the per-channel character
--    portrait (#748). Both admin channel RPCs gain the portrait and account
--    picture columns.
--    CREATE OR REPLACE cannot change a RETURNS TABLE shape, so both functions
--    are dropped and recreated, and their grants re-applied.
-- 2. Messages already come back for the whole channel (Main and rooms); the
--    view needs the room name to label them.
-- 3. `images_select` lost its is_server_admin() branch in
--    20260929164328_profile_avatar_read.sql, so an admin who is not a channel
--    member cannot sign a channel object and a portrait path renders broken.
--    Restore it (first added in 20260917163229_admin_message_inspection.sql).

-- ==========================================
-- 1. Channel roster
-- ==========================================

DROP FUNCTION IF EXISTS public.admin_list_channel_members(UUID);

CREATE FUNCTION public.admin_list_channel_members(
  p_channel_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  character_name TEXT,
  character_avatar_url TEXT,
  avatar_url TEXT,
  is_blocked BOOLEAN,
  is_active_player BOOLEAN
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

  IF NOT EXISTS (SELECT 1 FROM channels WHERE channels.id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  RETURN QUERY
    SELECT
      cm.user_id,
      p.display_name,
      cm.character_name,
      cm.character_avatar_url,
      p.avatar_url,
      cm.is_blocked,
      cm.is_active_player
    FROM channel_members cm
    -- The profile join is LEFT (same as admin_list_channel_messages): the
    -- membership row must survive profile deletion, and the client falls back
    -- to the character name when the display name is null.
    LEFT JOIN profiles p ON p.id = cm.user_id
    WHERE cm.channel_id = p_channel_id
    ORDER BY cm.joined_at ASC, cm.user_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_channel_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_channel_members(UUID) TO authenticated;

-- ==========================================
-- 2. Channel messages
-- ==========================================

DROP FUNCTION IF EXISTS public.admin_list_channel_messages(UUID, TIMESTAMPTZ, UUID, INT);

CREATE FUNCTION public.admin_list_channel_messages(
  p_channel_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  sender_id UUID,
  sender_display_name TEXT,
  sender_character_name TEXT,
  sender_character_avatar_url TEXT,
  sender_avatar_url TEXT,
  sub_channel_name TEXT,
  content TEXT,
  type TEXT,
  is_deleted BOOLEAN,
  whisper_to UUID,
  npc_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM channels WHERE channels.id = p_channel_id) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (auth.uid(), 'read_channel_messages', p_channel_id, jsonb_build_object('limit', v_limit));

  RETURN QUERY
    SELECT
      m.id,
      m.channel_id,
      m.sender_id,
      p.display_name,
      cm.character_name,
      cm.character_avatar_url,
      p.avatar_url,
      sc.name,
      m.content,
      m.type,
      m.is_deleted,
      m.whisper_to,
      m.npc_name,
      m.created_at
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.sender_id
    LEFT JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = m.sender_id
    -- Room label for the read-only view: NULL means Main, which needs no badge.
    LEFT JOIN sub_channels sc ON sc.id = m.sub_channel_id
    WHERE m.channel_id = p_channel_id
      AND (
        p_before IS NULL
        OR (m.created_at, m.id) < (
          p_before,
          COALESCE(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_channel_messages(UUID, TIMESTAMPTZ, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_channel_messages(UUID, TIMESTAMPTZ, UUID, INT) TO authenticated;

-- ==========================================
-- 3. Storage read: server admin
-- ==========================================

DROP POLICY IF EXISTS "images_select" ON storage.objects;
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'images'
    AND (
      is_channel_member((storage.foldername(name))[1]::uuid)
      OR (storage.foldername(name))[2] = 'profile'
      OR is_server_admin()
    )
  );
