-- 1. Create SECURITY DEFINER functions to break mutual recursion

CREATE OR REPLACE FUNCTION is_channel_member(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = c_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_channel_public(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels
    WHERE id = c_id AND is_public = true
  );
$$;

CREATE OR REPLACE FUNCTION is_channel_gm(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels
    WHERE id = c_id AND gm_id = auth.uid()
  );
$$;

-- 2. Fix 'channels' policies
DROP POLICY IF EXISTS "Private channels viewable by members" ON channels;

CREATE POLICY "Private channels viewable by members" 
  ON channels FOR SELECT USING (
    is_channel_member(id)
  );

-- 3. Fix 'channel_members' policies
DROP POLICY IF EXISTS "Members are viewable by members of the same channel" ON channel_members;
DROP POLICY IF EXISTS "GM can manage all members" ON channel_members;

CREATE POLICY "Members are viewable by members of the same channel" 
  ON channel_members FOR SELECT USING (
    user_id = auth.uid() OR is_channel_member(channel_id) OR is_channel_public(channel_id)
  );

CREATE POLICY "GM can manage all members" 
  ON channel_members FOR ALL USING (
    is_channel_gm(channel_id)
  );

-- 4. Fix 'messages' policies
DROP POLICY IF EXISTS "Messages are viewable by channel members, restricted by whispers" ON messages;
DROP POLICY IF EXISTS "Members can insert messages" ON messages;

CREATE POLICY "Messages are viewable by channel members, restricted by whispers" 
  ON messages FOR SELECT USING (
    is_channel_member(channel_id)
    AND (
      whisper_to IS NULL 
      OR whisper_to = auth.uid() 
      OR sender_id = auth.uid()
      OR is_channel_gm(channel_id)
    )
  );

CREATE POLICY "Members can insert messages" 
  ON messages FOR INSERT WITH CHECK (
    is_channel_member(channel_id)
    AND sender_id = auth.uid()
  );

-- 5. Fix 'dice_rolls' policies
DROP POLICY IF EXISTS "Dice rolls viewable by channel members" ON dice_rolls;
DROP POLICY IF EXISTS "Members can insert dice rolls" ON dice_rolls;

CREATE POLICY "Dice rolls viewable by channel members" 
  ON dice_rolls FOR SELECT USING (
    is_channel_member(channel_id)
  );

CREATE POLICY "Members can insert dice rolls" 
  ON dice_rolls FOR INSERT WITH CHECK (
    is_channel_member(channel_id)
    AND roller_id = auth.uid()
  );

-- 6. Fix 'channel_secrets' policy (from previous migration)
DROP POLICY IF EXISTS "GMs can manage secrets" ON channel_secrets;

CREATE POLICY "GMs can manage secrets" ON channel_secrets FOR ALL USING (
  is_channel_gm(channel_id)
);
