// Runtime validation for chat payloads crossing the Supabase boundary (issue
// #305). Realtime and PostgREST rows arrive as untrusted `unknown`; these
// schemas reject malformed rows before they reach reducers/rendering, so a bad
// row is dropped instead of crashing the channel view.

import { z } from 'zod'

// Joined profile references are display-only metadata; be lenient about their
// presence so a missing display field never drops the whole message.
const ProfileRefSchema = z.object({
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
}).nullable()

export const ReplyMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  sender_id: z.string().nullable(),
  is_deleted: z.boolean(),
  type: z.string(),
}).nullable()

// A message row as served by PostgREST (select with embeds) or Realtime
// (INSERT/UPDATE `new`). Joined profile/reply fields arrive as either an object
// or a one-to-many array, depending on the query; `formatMessage` normalizes
// those, so both shapes are accepted here.
const JoinedProfileSchema = z.union([ProfileRefSchema, z.array(ProfileRefSchema)])
const JoinedReplySchema = z.union([ReplyMessageSchema, z.array(ReplyMessageSchema)])

export const ServerMessageSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  sender_id: z.string().nullable(),
  content: z.string(),
  type: z.string(),
  whisper_to: z.string().nullable(),
  reply_to: z.string().nullable(),
  npc_name: z.string().nullable(),
  npc_avatar_url: z.string().nullable(),
  is_deleted: z.boolean(),
  is_edited: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  roll_dc: z.number().nullable(),
  roll_success: z.boolean().nullable(),
  client_request_id: z.string().nullable().optional(),
  mention_user_ids: z.array(z.string()).nullable().optional(),
  search_vector: z.unknown().optional(),
  sender: JoinedProfileSchema.optional(),
  whisper_target: JoinedProfileSchema.optional(),
  reply: JoinedReplySchema.optional(),
})

export type ServerMessage = z.infer<typeof ServerMessageSchema>

export const ReactionRowSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  created_at: z.string(),
  emoji: z.string(),
  message_id: z.string(),
  user_id: z.string(),
})

export type ReactionRow = z.infer<typeof ReactionRowSchema>

// Normalizes a validated server message, collapsing one-to-many embeds into a
// single object. Returns null when the row is malformed (the caller drops it).
export function normalizeMessage(row: ServerMessage) {
  return {
    ...row,
    sender: Array.isArray(row.sender) ? row.sender[0] : row.sender,
    whisper_target: Array.isArray(row.whisper_target) ? row.whisper_target[0] : row.whisper_target,
    reply: Array.isArray(row.reply) ? row.reply[0] : row.reply,
  }
}

export function parseServerMessage(value: unknown) {
  const parsed = ServerMessageSchema.safeParse(value)
  return parsed.success ? normalizeMessage(parsed.data) : null
}