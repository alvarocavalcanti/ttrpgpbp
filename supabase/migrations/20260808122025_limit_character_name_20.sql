-- #94: limit channel member character names to 20 characters.
-- Truncate existing values, then enforce the limit at the DB level.

UPDATE channel_members
SET character_name = LEFT(character_name, 20)
WHERE CHAR_LENGTH(character_name) > 20;

ALTER TABLE channel_members
  ADD CONSTRAINT channel_members_character_name_length CHECK (CHAR_LENGTH(character_name) <= 20);
