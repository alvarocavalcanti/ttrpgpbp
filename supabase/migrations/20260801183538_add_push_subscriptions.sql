-- Create a trigger that calls the edge function on new messages

create or replace function public.handle_new_message_notification()
returns trigger as $$
begin
  return new;
end;
$$ language plpgsql security definer;
