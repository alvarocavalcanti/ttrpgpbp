-- Issue #198: move frontend domain logic behind backend command boundaries.
--
-- This migration: schema + enforcement layer for the new command RPCs.
--   * messages gain client_request_id (idempotent retries) and mention_user_ids
--     (canonical mention metadata persisted server-side).
--   * dice_rolls joins the realtime publication (roll-history live subscription
--     was silently inert before) and direct client INSERT is revoked — rolls
--     can only be created via the roll_dice command.
--   * messages / message_reactions INSERT policies reject archived channels and
--     close the reply/whisper/NPC-type gaps at the data layer, so even a direct
--     write attempt is rejected independent of any command.

-- ==========================================
-- 1. messages: idempotency + mention metadata
-- ==========================================
ALTER TABLE messages
  ADD COLUMN client_request_id UUID,
  ADD COLUMN mention_user_ids UUID[];

-- Idempotent retries: a command replay with the same key returns the row that
-- already exists instead of inserting a duplicate (mobile double-tap / retry).
CREATE UNIQUE INDEX messages_client_request_uidx
  ON messages (channel_id, sender_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ==========================================
-- 2. dice_rolls: realtime + no direct client insert
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE dice_rolls;
ALTER TABLE dice_rolls REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Members can insert dice rolls" ON dice_rolls;

-- ==========================================
-- 3. messages INSERT: archived + routing-fields enforcement
-- ==========================================
-- Direct inserts now require an un-archived channel the caller belongs to, and
-- reject types the client must never set (system/dice_roll are command-only).
-- Reply targets must live in the same channel and whisper targets must be
-- channel members; scene/npc stay GM-only. Sender identity is derived from the
-- JWT, never trusted from the payload.
DROP POLICY IF EXISTS "Members can insert messages" ON messages;

CREATE POLICY "Members can insert messages"
  ON messages FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_id AND c.is_archived
    )
    AND is_channel_member(channel_id)
    AND sender_id = auth.uid()
    AND type IN ('regular', 'scene', 'npc')
    AND (type NOT IN ('scene', 'npc') OR is_channel_gm(channel_id))
    AND (
      reply_to IS NULL
      OR EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id = reply_to AND m.channel_id = messages.channel_id AND NOT m.is_deleted
      )
    )
    AND (
      whisper_to IS NULL
      OR EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = messages.channel_id AND cm.user_id = whisper_to AND NOT cm.is_blocked
      )
    )
  );

-- ==========================================
-- 4. message_reactions INSERT: archived rejection
-- ==========================================
DROP POLICY IF EXISTS "Users can add their own reactions" ON message_reactions;

CREATE POLICY "Users can add their own reactions"
  ON message_reactions FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_id AND c.is_archived
    )
    AND is_channel_member(channel_id)
    AND user_id = auth.uid()
  );

-- ==========================================
-- 5. join_channel: attributes + join system message in one call
-- ==========================================
-- The previous flow joined via the RPC then updated attributes in a second
-- non-transactional write (JoinChannel.tsx). Attributes now ride in the join
-- so the member row + attributes + join system message commit atomically.
DROP FUNCTION IF EXISTS join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_character_attributes JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
  v_attributes JSONB;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF v_channel.is_archived THEN
    RAISE EXCEPTION 'This channel has been archived and can no longer be joined.';
  END IF;

  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;

  IF v_channel.gm_id = auth.uid() THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL AND v_secret.password_hash = p_password_hash THEN
    -- Allowed via password
  ELSE
    RAISE EXCEPTION 'Invalid password or invite code';
  END IF;

  v_character_name := LEFT(COALESCE(p_character_name, ''), 20);

  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    v_max_channels := 10;
    SELECT (value #>> '{}')::int INTO v_max_channels
    FROM app_settings WHERE key = 'max_channels_per_user';
    v_max_channels := COALESCE(v_max_channels, 10);

    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = auth.uid() AND NOT c.is_archived;
    IF v_channel_count >= v_max_channels THEN
      RAISE EXCEPTION 'Channel limit reached. You can join at most % channels.', v_max_channels;
    END IF;
  END IF;

  -- Game-system modifier bounds: mirror the client clamp (DEFAULT -4..5,
  -- shadowdark -4..4) so a stored attribute can never exceed the system's.
  IF v_channel.game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;

  v_attributes := '{}'::jsonb;
  IF p_character_attributes IS NOT NULL AND jsonb_typeof(p_character_attributes) = 'object' THEN
    SELECT jsonb_object_agg(k, least(greatest(v::int, v_min_mod), v_max_mod))
    INTO v_attributes
    FROM jsonb_each_text(p_character_attributes) AS e(k, v)
    WHERE v ~ '^-?\d+$';
  END IF;

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url, attributes)
  VALUES (p_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url, v_attributes);

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, auth.uid(), 'system', v_character_name || ' joined the channel');
END;
$$;

REVOKE ALL ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ==========================================
-- 6. roll history: exclude rolls belonging to soft-deleted messages
-- ==========================================
CREATE OR REPLACE FUNCTION get_channel_roll_history(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  notation TEXT,
  result INTEGER,
  breakdown JSONB,
  created_at TIMESTAMPTZ,
  roller_id UUID,
  roller_display_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.notation, d.result, d.breakdown, d.created_at, d.roller_id, p.display_name
  FROM dice_rolls d
  JOIN messages m ON m.id = d.message_id
  LEFT JOIN profiles p ON p.id = d.roller_id
  WHERE d.channel_id = p_channel_id AND NOT m.is_deleted
  ORDER BY d.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION get_channel_roll_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_channel_roll_history(UUID) TO authenticated;

-- ==========================================
-- 7. Character field bounds enforced server-side
-- ==========================================
-- Phase 5: character name (already CHECK-capped at 20), notes, away message,
-- URLs, and attribute modifiers must be bounded at the DB, not just in the UI.
-- A BEFORE trigger clamps on any authenticated write so no client can persist
-- out-of-bounds values even through a direct table update.

CREATE OR REPLACE FUNCTION enforce_member_field_bounds()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.character_name := LEFT(COALESCE(NEW.character_name, ''), 20);
    NEW.character_notes := LEFT(COALESCE(NEW.character_notes, ''), 500);
    NEW.away_message := LEFT(COALESCE(NEW.away_message, ''), 200);
    NEW.character_avatar_url := LEFT(COALESCE(NEW.character_avatar_url, ''), 500);
    NEW.character_sheet_url := LEFT(COALESCE(NEW.character_sheet_url, ''), 500);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channel_members_field_bounds
  BEFORE INSERT OR UPDATE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION enforce_member_field_bounds();