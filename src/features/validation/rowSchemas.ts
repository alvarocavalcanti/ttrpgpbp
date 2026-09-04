// Runtime validation for legacy Supabase reads that trusted the generated DB
// types blind (issue #338, extends the #305 chat pattern). Rows crossing the
// PostgREST/RPC boundary are untrusted `unknown`; these schemas reject
// malformed rows before they reach state, so a schema/RLS-injected row-shape
// change drops the row instead of rendering undefined props.
//
// Schemas validate the identity and display columns the UI consumes and keep
// unknown keys (z.looseObject) so spreads into the generated row types stay
// complete.

import { z } from 'zod'

export function parseRow<T>(schema: z.ZodType<T>, row: unknown): T | null {
  const parsed = schema.safeParse(row)
  if (!parsed.success) {
    // Log shape only — rows can carry private content (admin threads,
    // messages) and must never be dumped whole to the console/log collector.
    console.error(
      'Malformed row dropped by runtime validation:',
      parsed.error.issues,
      'row keys:',
      row && typeof row === 'object' ? Object.keys(row) : typeof row,
    )
    return null
  }
  return parsed.data
}

// Lenient display fragment for joined profiles.
export const ProfileRefSchema = z.looseObject({
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
})

export type ProfileRef = z.infer<typeof ProfileRefSchema>

// Joined profiles arrive as object or one-to-many array depending on the
// query; accept both (normalizeProfileRef collapses the array afterwards).
const JoinedProfileRefSchema = z.union([ProfileRefSchema, z.array(ProfileRefSchema)])

// Accepts a joined profile in either object or one-to-many array shape.
export function normalizeProfileRef(value: unknown): ProfileRef | null {
  const ref = Array.isArray(value) ? value[0] : value
  return parseRow(ProfileRefSchema, ref)
}

export const ChannelRowSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullish(),
  gm_id: z.string().nullish(),
  is_archived: z.boolean().nullish(),
  game_system: z.string().nullish(),
  created_at: z.string().nullish(),
  last_message_at: z.string().nullish(),
  last_message_preview: z.string().nullish(),
})

export const ChannelMemberRowSchema = z.looseObject({
  id: z.string(),
  user_id: z.string(),
  channel_id: z.string().nullish(),
  character_name: z.string().nullish(),
  character_avatar_url: z.string().nullish(),
  character_sheet_url: z.string().nullish(),
  is_active_player: z.boolean().nullish(),
  is_blocked: z.boolean().nullish(),
  joined_at: z.string().nullish(),
  last_read_at: z.string().nullish(),
  notify_all_messages: z.boolean().nullish(),
  notify_gm_messages: z.boolean().nullish(),
  notify_turn: z.boolean().nullish(),
})

export const ChannelNotificationPrefsSchema = z.looseObject({
  notify_all_messages: z.boolean().nullish(),
  notify_gm_messages: z.boolean().nullish(),
  notify_turn: z.boolean().nullish(),
})

export const SearchMessageRowSchema = z.looseObject({
  id: z.string(),
  content: z.string(),
  channel_id: z.string().nullish(),
  sender_id: z.string().nullish(),
  type: z.string().nullish(),
  is_deleted: z.boolean().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  sender: JoinedProfileRefSchema.nullish(),
})

export const AdminThreadRowSchema = z.looseObject({
  id: z.string(),
  created_by: z.string().nullish(),
  gm_id: z.string().nullish(),
  subject: z.string().nullish(),
  type: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  last_message_at: z.string().nullish(),
  creator: JoinedProfileRefSchema.nullish(),
  gm: JoinedProfileRefSchema.nullish(),
  admin_thread_reads: z.array(z.looseObject({ last_read_at: z.string() })).nullish(),
})

export const AdminMessageRowSchema = z.looseObject({
  id: z.string(),
  content: z.string(),
  thread_id: z.string().nullish(),
  sender_id: z.string().nullish(),
  is_deleted: z.boolean().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  sender: JoinedProfileRefSchema.nullish(),
})

export const ProfileRowSchema = z.looseObject({
  id: z.string(),
  display_name: z.string().nullish(),
  avatar_url: z.string().nullish(),
  created_at: z.string().nullish(),
  is_suspended: z.boolean().nullish(),
})

// RPC scalars (unread counts, GM/admin flags) are equally untrusted.
export const RpcCountSchema = z.number()
export const RpcBooleanSchema = z.boolean()
