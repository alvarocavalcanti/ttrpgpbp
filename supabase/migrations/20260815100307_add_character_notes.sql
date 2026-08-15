-- #170: players can keep plain-text notes on their character, alongside the
-- numeric modifier fields.
ALTER TABLE channel_members ADD COLUMN character_notes TEXT;
