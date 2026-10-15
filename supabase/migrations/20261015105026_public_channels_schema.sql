-- #674 Phase A: public-facing channels — schema.
--
-- Re-introduces discoverable channels over a new join_mode axis. The old
-- is_public boolean was removed in #81 (20260808141428_private_channels_only);
-- this is a deliberate, documented reversal of that positioning, not drift.
--
-- join_mode='invite' is today's private/invite-only behaviour and stays the
-- DEFAULT, so every existing channel is untouched. join_mode='approval' is a
-- listed, apply-only channel the GM publishes with a description + constraints.
-- Membership is only ever granted when the GM approves a request
-- (decide_join_request); there is no instant/open join.
--
-- Writes: join_mode / description / constraints / application_prompt are set by
-- the GM through update_channel_settings; requests and decisions go through the
-- SECURITY DEFINER RPCs in 20261015105032_public_channels_rpcs.sql. Clients
-- hold no direct INSERT/UPDATE/DELETE on channel_join_requests.

-- ==========================================
-- 1. Join mode + listing copy on channels
-- ==========================================

CREATE TYPE public.channel_join_mode AS ENUM ('invite', 'approval');
CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

ALTER TABLE public.channels
  ADD COLUMN join_mode          public.channel_join_mode NOT NULL DEFAULT 'invite',
  ADD COLUMN description        TEXT,
  ADD COLUMN constraints        TEXT,
  ADD COLUMN application_prompt TEXT;

-- A listed channel must carry a real (non-blank, capped) description and
-- constraints; a private channel never needs them.
ALTER TABLE public.channels ADD CONSTRAINT channels_listing_fields CHECK (
  join_mode = 'invite'
  OR (
    description IS NOT NULL AND btrim(description) <> '' AND char_length(description) <= 600
    AND constraints IS NOT NULL AND btrim(constraints) <> '' AND char_length(constraints) <= 600
  )
);

ALTER TABLE public.channels ADD CONSTRAINT channels_prompt_len CHECK (
  application_prompt IS NULL OR char_length(application_prompt) <= 300
);

-- ==========================================
-- 2. Join requests
-- ==========================================

CREATE TABLE public.channel_join_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  message        TEXT,
  status         public.join_request_status NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  decided_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- One open application per user per channel.
CREATE UNIQUE INDEX channel_join_requests_pending_uniq
  ON public.channel_join_requests (channel_id, user_id) WHERE status = 'pending';

-- GM approval queue.
CREATE INDEX channel_join_requests_channel_status_idx
  ON public.channel_join_requests (channel_id, status);

ALTER TABLE public.channel_join_requests ENABLE ROW LEVEL SECURITY;

-- Applicants read their own requests; the GM reads their channel's. There is no
-- client INSERT/UPDATE/DELETE policy: request_to_join_channel /
-- withdraw_join_request / decide_join_request (SECURITY DEFINER) are the only
-- write paths, so a client can never set status='approved' directly.
CREATE POLICY "Applicants can view their own join requests"
  ON public.channel_join_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "GMs can view their channel join requests"
  ON public.channel_join_requests FOR SELECT
  USING (is_channel_gm(channel_id));
