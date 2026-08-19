-- Add composite indexes for hot query paths

CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON public.channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_gm_id ON public.channels(gm_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id_created_at_desc ON public.messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_whisper_to ON public.messages(whisper_to);
CREATE INDEX IF NOT EXISTS idx_dice_rolls_channel_id_created_at_desc ON public.dice_rolls(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dice_rolls_roller_id ON public.dice_rolls(roller_id);
CREATE INDEX IF NOT EXISTS idx_safety_card_events_message_id ON public.safety_card_events(message_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
