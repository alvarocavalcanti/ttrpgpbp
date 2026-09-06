-- Cap message content at the database layer (#404 PBP-2).
-- The send_message RPC and the composer's maxLength both enforce 4000
-- characters, but a direct PostgREST INSERT with a valid session bypassed
-- both, letting a paste-flood deliver an unbounded body to every member's
-- realtime feed. The database gets the final word.
-- NOT VALID matches the abuse_reports_reason_length precedent: existing rows
-- predate the bound and are not re-validated, but every new write is.
-- Truncate legacy oversize bodies first: a NOT VALID check is skipped for
-- rows existing at ADD time, but it IS re-validated on every subsequent
-- UPDATE — an oversize row could otherwise never be edited or soft-deleted.
UPDATE public.messages SET content = left(content, 4000) WHERE char_length(content) > 4000;

ALTER TABLE public.messages ADD CONSTRAINT messages_content_length
  CHECK (char_length(content) <= 4000) NOT VALID;
