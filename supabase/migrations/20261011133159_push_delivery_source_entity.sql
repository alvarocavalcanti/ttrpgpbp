-- Correlate push delivery outcomes with the row that triggered them.
--
-- push_delivery_log already records `event_kind` but not *which* message or
-- membership fired the push, so per-announcement delivery counts were
-- impossible to derive (the `event_id` is a random per-invocation correlation
-- id shared across a fan-out, not a source key). The edge function now writes
-- the trigger payload's source row id here.
--
-- Polymorphic — points at admin_messages.id, messages.id, or
-- channel_members.id depending on event_kind — so it is intentionally not a
-- foreign key. Nullable: historical rows (and any future event kind that has
-- no source row) keep NULL.
alter table public.push_delivery_log
  add column if not exists source_entity_id uuid;

create index if not exists push_delivery_log_source_entity_idx
  on public.push_delivery_log (source_entity_id)
  where source_entity_id is not null;
