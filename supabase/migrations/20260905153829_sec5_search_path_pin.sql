-- Issue #402 / SEC-5: set_channel_last_message_at() was recreated in
-- 20260904111055 as SECURITY DEFINER without the `SET search_path = public`
-- pin its sibling definer functions carry. A mutable search_path on a
-- definer function is a privilege-hygiene defect (same Supabase-linter class
-- phase4 flagged for handle_new_user). Behavior is unchanged: every object
-- referenced is already schema-qualified.
create or replace function public.set_channel_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channels
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.whisper_to is null then left(new.content, 120)
      end
  where id = new.channel_id;
  return new;
end;
$$;
