-- Add last_read_at to channel_members
alter table public.channel_members add column last_read_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- Notification Preferences
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  push_enabled boolean default true not null,
  badge_enabled boolean default true not null,
  email_enabled boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

alter table public.notification_preferences enable row level security;

create policy "Users can manage their own notification preferences"
  on public.notification_preferences
  for all using (auth.uid() = user_id);
