-- Issue #302: direct message inserts could persist fabricated mention_user_ids
-- (the INSERT policy validated whisper/reply targets but not the mention list).
-- A fabricated mention isn't the push-leak vector (the push function re-parses
-- content and intersects with membership), but the canonical column must not
-- hold an outsider's id, so constrain it at the data layer. The server-side
-- send_message command already resolves mentions against membership; this
-- closes the direct-write gap. (send_message is SECURITY DEFINER and bypasses
-- this policy.)

drop policy if exists "Members can insert messages" on public.messages;

create policy "Members can insert messages"
  on public.messages for insert with check (
    not exists (
      select 1 from channels c where c.id = channel_id and c.is_archived
    )
    and is_channel_member(channel_id)
    and sender_id = auth.uid()
    and type in ('regular', 'scene', 'npc')
    and (type not in ('scene', 'npc') or is_channel_gm(channel_id))
    and (
      reply_to is null
      or exists (
        select 1 from messages m
        where m.id = reply_to and m.channel_id = messages.channel_id and not m.is_deleted
      )
    )
    and (
      whisper_to is null
      or exists (
        select 1 from channel_members cm
        where cm.channel_id = messages.channel_id and cm.user_id = whisper_to and not cm.is_blocked
      )
    )
    and (
      mention_user_ids is null
      or not exists (
        select 1 from unnest(mention_user_ids) as t(uid)
        where not exists (
          select 1 from channel_members cm
          where cm.channel_id = messages.channel_id
            and cm.user_id = t.uid
            and not cm.is_blocked
        )
      )
    )
  );
