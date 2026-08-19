-- Issue #214: enforce mutation limits and immutable message metadata at the DB boundary.

-- Existing rows predate these bounds. Normalize them once before adding checks;
-- future writes are rejected by constraints/triggers instead of truncated.
UPDATE profiles SET
  display_name = LEFT(display_name, 40),
  avatar_url = LEFT(avatar_url, 500)
WHERE char_length(COALESCE(display_name, '')) > 40
   OR char_length(COALESCE(avatar_url, '')) > 500;

UPDATE channels SET
  name = LEFT(name, 80),
  avatar_url = LEFT(avatar_url, 500),
  map_url = LEFT(map_url, 500),
  resources_url = LEFT(resources_url, 500),
  safety_tools_url = LEFT(safety_tools_url, 500),
  status_text = LEFT(status_text, 2000)
WHERE char_length(name) > 80
   OR char_length(COALESCE(avatar_url, '')) > 500
   OR char_length(COALESCE(map_url, '')) > 500
   OR char_length(COALESCE(resources_url, '')) > 500
   OR char_length(COALESCE(safety_tools_url, '')) > 500
   OR char_length(COALESCE(status_text, '')) > 2000;

UPDATE channel_members SET
  character_notes = LEFT(character_notes, 500),
  away_message = LEFT(away_message, 200),
  character_avatar_url = LEFT(character_avatar_url, 500),
  character_sheet_url = LEFT(character_sheet_url, 500)
WHERE char_length(COALESCE(character_notes, '')) > 500
   OR char_length(COALESCE(away_message, '')) > 200
   OR char_length(COALESCE(character_avatar_url, '')) > 500
   OR char_length(COALESCE(character_sheet_url, '')) > 500;

UPDATE channel_npcs SET
  name = LEFT(name, 40),
  avatar_url = LEFT(avatar_url, 500)
WHERE char_length(name) > 40 OR char_length(avatar_url) > 500;

UPDATE channel_secrets SET gm_only_resources_url = LEFT(gm_only_resources_url, 500)
WHERE gm_only_resources_url IS NOT NULL AND char_length(gm_only_resources_url) > 500;

UPDATE channel_safety_tools SET
  lines = LEFT(lines, 2000),
  veils = LEFT(veils, 2000)
WHERE char_length(lines) > 2000 OR char_length(veils) > 2000;

UPDATE messages SET
  npc_name = LEFT(npc_name, 40),
  npc_avatar_url = LEFT(npc_avatar_url, 500)
WHERE char_length(COALESCE(npc_name, '')) > 40
   OR char_length(COALESCE(npc_avatar_url, '')) > 500;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 40),
  ADD CONSTRAINT profiles_avatar_url_length CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500);

ALTER TABLE channels
  ADD CONSTRAINT channels_name_length CHECK (char_length(name) <= 80),
  ADD CONSTRAINT channels_avatar_url_length CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  ADD CONSTRAINT channels_map_url_length CHECK (map_url IS NULL OR char_length(map_url) <= 500),
  ADD CONSTRAINT channels_resources_url_length CHECK (resources_url IS NULL OR char_length(resources_url) <= 500),
  ADD CONSTRAINT channels_safety_tools_url_length CHECK (safety_tools_url IS NULL OR char_length(safety_tools_url) <= 500),
  ADD CONSTRAINT channels_status_text_length CHECK (status_text IS NULL OR char_length(status_text) <= 2000);

ALTER TABLE channel_members
  ADD CONSTRAINT channel_members_character_notes_length CHECK (character_notes IS NULL OR char_length(character_notes) <= 500),
  ADD CONSTRAINT channel_members_away_message_length CHECK (away_message IS NULL OR char_length(away_message) <= 200),
  ADD CONSTRAINT channel_members_character_avatar_url_length CHECK (character_avatar_url IS NULL OR char_length(character_avatar_url) <= 500),
  ADD CONSTRAINT channel_members_character_sheet_url_length CHECK (character_sheet_url IS NULL OR char_length(character_sheet_url) <= 500);

ALTER TABLE channel_npcs
  ADD CONSTRAINT channel_npcs_name_length CHECK (char_length(name) <= 40),
  ADD CONSTRAINT channel_npcs_avatar_url_length CHECK (char_length(avatar_url) <= 500);

ALTER TABLE channel_secrets
  ADD CONSTRAINT channel_secrets_gm_resources_url_length
    CHECK (gm_only_resources_url IS NULL OR char_length(gm_only_resources_url) <= 500);

ALTER TABLE channel_safety_tools
  ADD CONSTRAINT channel_safety_tools_lines_length CHECK (char_length(lines) <= 2000),
  ADD CONSTRAINT channel_safety_tools_veils_length CHECK (char_length(veils) <= 2000);

ALTER TABLE messages
  ADD CONSTRAINT messages_npc_name_length CHECK (npc_name IS NULL OR char_length(npc_name) <= 40),
  ADD CONSTRAINT messages_npc_avatar_url_length CHECK (npc_avatar_url IS NULL OR char_length(npc_avatar_url) <= 500);

-- Replace the old authenticated-write truncation with explicit validation.
CREATE OR REPLACE FUNCTION enforce_member_field_bounds()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF char_length(NEW.character_name) > 20 THEN
      RAISE EXCEPTION 'Character name is too long (max 20 characters).';
    END IF;
    IF char_length(COALESCE(NEW.character_notes, '')) > 500 THEN
      RAISE EXCEPTION 'Character notes are too long (max 500 characters).';
    END IF;
    IF char_length(COALESCE(NEW.away_message, '')) > 200 THEN
      RAISE EXCEPTION 'Away message is too long (max 200 characters).';
    END IF;
    IF char_length(COALESCE(NEW.character_avatar_url, '')) > 500
       OR char_length(COALESCE(NEW.character_sheet_url, '')) > 500 THEN
      RAISE EXCEPTION 'Character URL is too long (max 500 characters).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Message updates may only change content/edit/delete state and updated_at.
CREATE OR REPLACE FUNCTION prevent_message_update_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.whisper_to IS DISTINCT FROM OLD.whisper_to
       OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
       OR NEW.npc_name IS DISTINCT FROM OLD.npc_name
       OR NEW.npc_avatar_url IS DISTINCT FROM OLD.npc_avatar_url
       OR NEW.roll_dc IS DISTINCT FROM OLD.roll_dc
       OR NEW.roll_success IS DISTINCT FROM OLD.roll_success
       OR NEW.mention_user_ids IS DISTINCT FROM OLD.mention_user_ids
       OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Message metadata is immutable.';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content AND char_length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'Message is too long (max 4000 characters).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_update_integrity ON messages;
CREATE TRIGGER messages_update_integrity
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION prevent_message_update_tampering();

-- Keep warning limit server-authoritative without duplicating the dice command.
ALTER FUNCTION roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID)
  RENAME TO roll_dice_unchecked;

CREATE FUNCTION roll_dice(
  p_channel_id UUID,
  p_notation TEXT,
  p_reply_to UUID DEFAULT NULL,
  p_warning TEXT DEFAULT NULL,
  p_dc INTEGER DEFAULT NULL,
  p_client_request_id UUID DEFAULT NULL
)
RETURNS TABLE (message_id UUID, dice_roll_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF p_warning IS NOT NULL AND char_length(p_warning) > 500 THEN
    RAISE EXCEPTION 'Roll warning is too long (max 500 characters).';
  END IF;
  RETURN QUERY SELECT * FROM roll_dice_unchecked(
    p_channel_id, p_notation, p_reply_to, p_warning, p_dc, p_client_request_id
  );
END;
$func$;

REVOKE ALL ON FUNCTION roll_dice_unchecked(UUID, TEXT, UUID, TEXT, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION roll_dice_unchecked(UUID, TEXT, UUID, TEXT, INTEGER, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roll_dice(UUID, TEXT, UUID, TEXT, INTEGER, UUID) TO authenticated;

-- Derive unread ownership from the JWT. Keep the argument for existing clients,
-- but reject attempts to query another user's channels.
CREATE OR REPLACE FUNCTION get_user_channels_unread(p_user_id UUID)
RETURNS TABLE (channel_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'User id must match authenticated user.';
  END IF;

  RETURN QUERY
  SELECT cm.channel_id, COALESCE((
    SELECT COUNT(*) FROM messages m
    WHERE m.channel_id = cm.channel_id
      AND m.created_at > cm.last_read_at
      AND m.sender_id <> v_uid
      AND m.is_deleted = false
  ), 0)::BIGINT
  FROM channel_members cm
  WHERE cm.user_id = v_uid;
END;
$func$;

REVOKE ALL ON FUNCTION get_user_channels_unread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_channels_unread(UUID) TO authenticated;
