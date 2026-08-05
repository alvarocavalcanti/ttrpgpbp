ALTER TABLE channels ADD COLUMN game_system TEXT NOT NULL DEFAULT 'none';
ALTER TABLE channel_members ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
