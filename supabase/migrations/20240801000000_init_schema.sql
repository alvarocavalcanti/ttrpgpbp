-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. PROFILES (Extends auth.users)
-- ==========================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" 
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email, 
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();


-- ==========================================
-- 2. CHANNELS
-- ==========================================
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gm_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  invite_code TEXT UNIQUE,
  map_url TEXT,
  resources_url TEXT,
  status_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public channels are viewable by everyone" 
  ON channels FOR SELECT USING (is_public = true);

CREATE POLICY "Private channels viewable by members" 
  ON channels FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members cm 
      WHERE cm.channel_id = channels.id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "GM can insert channels" 
  ON channels FOR INSERT WITH CHECK (auth.uid() = gm_id);

CREATE POLICY "GM can update channels" 
  ON channels FOR UPDATE USING (auth.uid() = gm_id);


-- ==========================================
-- 3. CHANNEL MEMBERS
-- ==========================================
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  character_avatar_url TEXT,
  character_sheet_url TEXT,
  is_active_player BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members are viewable by members of the same channel" 
  ON channel_members FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members my_cm 
      WHERE my_cm.channel_id = channel_members.channel_id AND my_cm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_members.channel_id AND c.is_public = true
    )
  );

CREATE POLICY "Users can insert themselves (join channel)" 
  ON channel_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own character info" 
  ON channel_members FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "GM can manage all members" 
  ON channel_members FOR ALL USING (
    EXISTS (
      SELECT 1 FROM channels WHERE id = channel_members.channel_id AND gm_id = auth.uid()
    )
  );


-- ==========================================
-- 4. MESSAGES
-- ==========================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('regular', 'scene', 'dice_roll', 'system')),
  content TEXT NOT NULL,
  whisper_to UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_search_idx ON messages USING GIN (search_vector);
CREATE INDEX messages_channel_idx ON messages(channel_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are viewable by channel members, restricted by whispers" 
  ON messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members cm WHERE cm.channel_id = messages.channel_id AND cm.user_id = auth.uid()
    )
    AND (
      whisper_to IS NULL 
      OR whisper_to = auth.uid() 
      OR sender_id = auth.uid()
      OR EXISTS (SELECT 1 FROM channels c WHERE c.id = messages.channel_id AND c.gm_id = auth.uid())
    )
  );

CREATE POLICY "Members can insert messages" 
  ON messages FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM channel_members cm WHERE cm.channel_id = messages.channel_id AND cm.user_id = auth.uid()
    )
    AND sender_id = auth.uid()
  );

CREATE POLICY "Senders can edit their own messages within 15 mins" 
  ON messages FOR UPDATE USING (
    sender_id = auth.uid() 
    AND type = 'regular'
    AND is_deleted = false
    AND (NOW() - created_at) < INTERVAL '15 minutes'
  );

-- ==========================================
-- 5. DICE ROLLS
-- ==========================================
CREATE TABLE dice_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  roller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notation TEXT NOT NULL,
  result INTEGER NOT NULL,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dice_rolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dice rolls viewable by channel members" 
  ON dice_rolls FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members cm WHERE cm.channel_id = dice_rolls.channel_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert dice rolls" 
  ON dice_rolls FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM channel_members cm WHERE cm.channel_id = dice_rolls.channel_id AND cm.user_id = auth.uid()
    )
    AND roller_id = auth.uid()
  );


-- ==========================================
-- 6. NOTIFICATION PREFERENCES
-- ==========================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  badge_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences" 
  ON notification_preferences FOR ALL USING (auth.uid() = user_id);

-- Auto-create preferences on user creation
CREATE OR REPLACE FUNCTION handle_new_user_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user_prefs();

-- ==========================================
-- 7. ENABLE REALTIME
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;