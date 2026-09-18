-- Review fix L4: drop the two admin content RPCs that no client calls.
--
-- admin_read_image and admin_list_content_matches were added with the content
-- inspection work but nothing in src consumes them (the message viewer stays
-- plain text, and blocked uploads are already visible via csam_match_blocked
-- rows in a user's moderation history). An admin-gated RPC with no caller is
-- untested surface, so it goes until a UI actually needs it.
--
-- Admin image access itself is unchanged: the images_select policy still admits
-- the server admin, so an image can be inspected through the Storage API or the
-- dashboard during a report investigation.

DROP FUNCTION IF EXISTS public.admin_read_image(TEXT);
DROP FUNCTION IF EXISTS public.admin_list_content_matches();
