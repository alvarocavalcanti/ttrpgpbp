-- Issue #811: the NPC portrait picker searched Iconify, whose /search endpoint
-- returns collection-namespaced ids ("game-icons:dragon-head"), and concatenated
-- them into the icon URL. Rows written that way point at
-- .../game-icons/game-icons:<id>.svg, which 404s. The client now emits bare ids;
-- this repairs the rows already stored.
--
-- Runs without a JWT (migrations execute as the owner), so the
-- auth.uid()-guarded message invariants (20260818140000) allow the messages
-- update, and the NPC avatar scheme triggers (20260907094614) accept the https
-- replacement. Both statements match only the doubled segment, so every other
-- URL shape (relative storage paths, plain https, NULL) is left untouched, and
-- re-running them is a no-op.
UPDATE public.channel_npcs
SET avatar_url = replace(avatar_url, '/game-icons/game-icons:', '/game-icons/')
WHERE avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%';

UPDATE public.messages
SET npc_avatar_url = replace(npc_avatar_url, '/game-icons/game-icons:', '/game-icons/')
WHERE npc_avatar_url LIKE '%api.iconify.design/game-icons/game-icons:%';
