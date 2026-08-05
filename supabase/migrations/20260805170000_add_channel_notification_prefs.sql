-- Per-channel notification preferences for each member
alter table public.channel_members add column if not exists notify_all_messages boolean default true not null;
alter table public.channel_members add column if not exists notify_gm_messages boolean default true not null;
alter table public.channel_members add column if not exists notify_turn boolean default true not null;
