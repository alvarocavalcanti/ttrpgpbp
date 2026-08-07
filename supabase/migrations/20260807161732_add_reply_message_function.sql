-- PostgREST requires a computed relationship to resolve self-referencing FKs
-- (https://docs.postgrest.org/en/v12/references/api/resource_embedding.html#recursive-relationships).
-- This lets clients embed the message a message replies to via `reply:reply_message(...)`.
CREATE OR REPLACE FUNCTION reply_message(messages)
RETURNS SETOF messages ROWS 1 AS $$
  SELECT * FROM messages WHERE id = $1.reply_to
$$ STABLE LANGUAGE SQL;
