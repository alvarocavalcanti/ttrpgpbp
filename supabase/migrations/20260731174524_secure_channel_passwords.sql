-- Move password_hash to a separate secure table
CREATE TABLE channel_secrets (
  channel_id UUID PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  password_hash TEXT
);

-- Enable RLS on channel_secrets
ALTER TABLE channel_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GMs can manage secrets" ON channel_secrets FOR ALL USING (
  EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_secrets.channel_id AND c.gm_id = auth.uid())
);

-- Migrate existing data
INSERT INTO channel_secrets (channel_id, password_hash)
SELECT id, password_hash FROM channels WHERE password_hash IS NOT NULL;

-- Remove password_hash from channels so it never leaves the database
ALTER TABLE channels DROP COLUMN password_hash;

-- Create a computed column function for PostgREST to expose 'has_password'
CREATE OR REPLACE FUNCTION has_password(c channels) 
RETURNS boolean 
LANGUAGE sql 
SECURITY DEFINER 
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM channel_secrets 
    WHERE channel_id = c.id AND password_hash IS NOT NULL
  );
$$;

-- Update the join_channel RPC to use the new channel_secrets table
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
  
  -- If the channel is public and has no password, anyone can join
  IF v_channel.is_public AND (v_secret IS NULL OR v_secret.password_hash IS NULL) THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL AND v_secret.password_hash = p_password_hash THEN
    -- Allowed via password
  ELSE
    RAISE EXCEPTION 'Unauthorized: Invalid password or invite code';
  END IF;

  -- Insert the member
  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url)
  VALUES (p_channel_id, auth.uid(), p_character_name, p_character_avatar_url, p_character_sheet_url);
END;
$$;
