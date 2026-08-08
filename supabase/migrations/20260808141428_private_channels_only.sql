-- #81: support only private channels.
--
-- Public channels don't fit the app's goal (a per-invite PBP messenger), so the
-- is_public concept is removed entirely. All channels are private: the lobby
-- lists only channels the user is a member of, and joining always requires an
-- invite code or a password (or being the GM).

-- Drop the public-channel SELECT policy on channels.
DROP POLICY IF EXISTS "Public channels are viewable by everyone" ON channels;

-- Recreate the channel_members SELECT policy without the is_channel_public clause.
-- Must drop this policy BEFORE dropping is_channel_public(), since the existing
-- policy depends on that function.
DROP POLICY IF EXISTS "Members are viewable by members of the same channel" ON channel_members;
CREATE POLICY "Members are viewable by members of the same channel"
  ON channel_members FOR SELECT USING (
    user_id = auth.uid() OR is_channel_member(channel_id)
  );

-- Drop the is_channel_public helper; it was only used to expose public channels.
DROP FUNCTION IF EXISTS is_channel_public(UUID);

-- Channel metadata is visible for joining so the join page can show the channel
-- name and whether a password is required. Only channels that carry an invite
-- code are joinable this way. Access to messages, members, reactions and dice
-- rolls is still gated by their own policies, and joining still requires a
-- valid invite code or password via join_channel.
CREATE POLICY "Channels are viewable for joining"
  ON channels FOR SELECT USING (invite_code IS NOT NULL);

-- join_channel: joining is allowed for the GM, a matching invite code, or a
-- matching password. There is no public no-password path anymore. Recreated
-- BEFORE dropping is_public, because the old body references v_channel.is_public.
CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  -- Use a separate query to handle the potential absence of a row
  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;
  
  -- GM can always join their own channel
  IF v_channel.gm_id = auth.uid() THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL AND v_secret.password_hash = p_password_hash THEN
    -- Allowed via password
  ELSE
    RAISE EXCEPTION 'Invalid password or invite code';
  END IF;

  -- Enforce the 20-char character name limit
  v_character_name := LEFT(p_character_name, 20);

  -- Insert the member
  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
  VALUES (p_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url);
END;
$$;

-- Drop the is_public column.
ALTER TABLE channels DROP COLUMN is_public;
