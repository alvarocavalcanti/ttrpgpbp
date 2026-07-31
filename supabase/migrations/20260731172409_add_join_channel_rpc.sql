-- Drop the open insert policy
DROP POLICY IF EXISTS "Users can insert themselves (join channel)" ON channel_members;

-- Create the RPC function
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
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  
  -- If the channel is public and has no password, anyone can join
  IF v_channel.is_public AND v_channel.password_hash IS NULL THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_channel.password_hash IS NOT NULL AND v_channel.password_hash = p_password_hash THEN
    -- Allowed via password
  ELSE
    RAISE EXCEPTION 'Unauthorized: Invalid password or invite code';
  END IF;

  -- Insert the member
  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
  VALUES (p_channel_id, auth.uid(), p_character_name, p_character_avatar_url, p_character_sheet_url);
END;
$$;
