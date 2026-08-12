import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import webPush from "npm:web-push@3.6.7"
import { resolvePushTargets } from "./filter.ts"
import type { PushEvent, PushMember } from "./filter.ts"

// Deployed app origins. Override with the ALLOWED_ORIGINS secret (comma
// separated) for self-hosting.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://ttrpgpbp.pages.dev",
]

function isAllowedOrigin(origin: string): boolean {
  const env = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
  const allowed = env.length > 0 ? env : DEFAULT_ALLOWED_ORIGINS
  if (allowed.includes(origin)) return true
  // Cloudflare Pages preview deployments are <hash>.ttrpgpbp.pages.dev
  return origin.endsWith(".ttrpgpbp.pages.dev")
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
  const origin = req.headers.get("origin")
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }
  return headers
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

interface BuiltEvent {
  event: PushEvent
  members: PushMember[]
}

// Message events: the caller supplies a message_id and (optionally) the
// mention routing list. Everything else — channel, sender, content, whisper
// target — is read from the database so a caller cannot spoof other users'
// messages. Caller must be the sender and a (non-blocked) member of the
// channel.
async function buildMessageEvent(
  payload: Record<string, unknown>,
  userId: string,
  serviceClient: ReturnType<typeof createClient>,
  userClient: ReturnType<typeof createClient>
): Promise<BuiltEvent> {
  const messageId = payload.message_id
  if (typeof messageId !== "string") {
    throw new HttpError(400, "Invalid payload")
  }

  const { data: message, error } = await serviceClient
    .from("messages")
    .select("id, channel_id, sender_id, content, type, npc_name, whisper_to")
    .eq("id", messageId)
    .maybeSingle()

  if (error || !message) {
    throw new HttpError(404, "Message not found")
  }
  if (message.sender_id !== userId) {
    throw new HttpError(403, "Forbidden")
  }

  const { data: isMember } = await userClient.rpc("is_channel_member", { c_id: message.channel_id })
  if (!isMember) {
    throw new HttpError(403, "Forbidden")
  }

  const [{ data: channel }, { data: sender }, { data: whisperTarget }, { data: fetchedMembers }] = await Promise.all([
    serviceClient.from("channels").select("name, gm_id").eq("id", message.channel_id).maybeSingle(),
    serviceClient.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle(),
    message.whisper_to
      ? serviceClient.from("profiles").select("display_name").eq("id", message.whisper_to).maybeSingle()
      : Promise.resolve({ data: null }),
    serviceClient
      .from("channel_members")
      .select("user_id, notify_all_messages, notify_gm_messages, notify_turn, is_blocked, is_away")
      .eq("channel_id", message.channel_id),
  ])

  return {
    members: fetchedMembers ?? [],
    event: {
      kind: "message",
      channel_id: message.channel_id,
      channel_name: channel?.name,
      sender_id: message.sender_id,
      sender_name: sender?.display_name,
      content: message.content,
      type: message.type,
      npc_name: message.npc_name,
      whisper_to: message.whisper_to,
      whisper_target_name: whisperTarget?.display_name,
      mention_user_ids: Array.isArray(payload.mention_user_ids) ? payload.mention_user_ids as string[] : undefined,
      gm_id: channel?.gm_id,
    },
  }
}

// Turn events: the caller supplies a member_id. Only the GM of the channel may
// mark a player as active, so the caller must be the channel GM. Content comes
// from the database.
async function buildTurnEvent(
  payload: Record<string, unknown>,
  userClient: ReturnType<typeof createClient>,
  serviceClient: ReturnType<typeof createClient>
): Promise<BuiltEvent & { isActivePlayer: boolean }> {
  const memberId = payload.member_id
  if (typeof memberId !== "string") {
    throw new HttpError(400, "Invalid payload")
  }

  const { data: member, error } = await serviceClient
    .from("channel_members")
    .select("id, channel_id, user_id, is_active_player")
    .eq("id", memberId)
    .maybeSingle()

  if (error || !member) {
    throw new HttpError(404, "Member not found")
  }

  const { data: isGm } = await userClient.rpc("is_channel_gm", { c_id: member.channel_id })
  if (!isGm) {
    throw new HttpError(403, "Forbidden")
  }

  const [{ data: channel }, { data: fetchedMembers }] = await Promise.all([
    serviceClient.from("channels").select("name").eq("id", member.channel_id).maybeSingle(),
    serviceClient
      .from("channel_members")
      .select("user_id, notify_all_messages, notify_gm_messages, notify_turn, is_blocked, is_away")
      .eq("channel_id", member.channel_id),
  ])

  return {
    members: fetchedMembers ?? [],
    isActivePlayer: member.is_active_player,
    event: {
      kind: "turn",
      channel_id: member.channel_id,
      channel_name: channel?.name,
      user_id: member.user_id,
    },
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Missing Supabase configuration")
      return json({ error: "Internal server error" }, 500, req)
    }

    // verify_jwt = true means the platform has already validated the token, but
    // we still resolve the authenticated user to authorize each event.
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, req)
    }
    const accessToken = authHeader.slice("Bearer ".length)

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return json({ error: "Unauthorized" }, 401, req)
    }

    const payload = await req.json() as Record<string, unknown>
    const table = payload.table

    let event: PushEvent
    let members: PushMember[]

    if (table === "messages") {
      const built = await buildMessageEvent(payload, user.id, serviceClient, userClient)
      event = built.event
      members = built.members
    } else if (table === "channel_members") {
      const built = await buildTurnEvent(payload, userClient, serviceClient)
      if (!built.isActivePlayer) {
        return json({ success: true, message: "Not an active player event" }, 200, req)
      }
      event = built.event
      members = built.members
    } else {
      return json({ error: "Unknown table" }, 400, req)
    }

    const { targetUserIds, title, body, url } = resolvePushTargets(event, members)

    if (targetUserIds.length === 0) {
      return json({ success: true, message: "No targets" }, 200, req)
    }

    // Get notification preferences and subscriptions for these users
    const { data: prefs } = await serviceClient
      .from("notification_preferences")
      .select("user_id, push_enabled")
      .in("user_id", targetUserIds)

    const pushEnabledUserIds = targetUserIds.filter(uid => {
      const p = prefs?.find(pref => pref.user_id === uid)
      return p ? p.push_enabled : true // Default to true if no preference set
    })

    if (pushEnabledUserIds.length === 0) {
      return json({ success: true, message: "Push disabled for all targets" }, 200, req)
    }

    const { data: subs } = await serviceClient
      .from("push_subscriptions")
      .select("*")
      .in("user_id", pushEnabledUserIds)

    if (!subs || subs.length === 0) {
      return json({ success: true, message: "No active subscriptions" }, 200, req)
    }

    const vapidPublic = Deno.env.get("VITE_VAPID_PUBLIC_KEY")
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")

    if (!vapidPublic || !vapidPrivate) {
      console.warn("VAPID keys not configured")
      return json({ error: "Internal server error" }, 500, req)
    }

    webPush.setVapidDetails(
      "mailto:admin@example.com",
      vapidPublic,
      vapidPrivate
    )

    const pushPromises = subs.map(async (sub) => {
      const pushPayload = JSON.stringify({ title, body, url })

      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          pushPayload
        )
      } catch (err: any) {
        console.error(`Error sending to ${sub.endpoint}:`, err)
        // If subscription is gone, delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await serviceClient
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id)
        }
      }
    })

    await Promise.all(pushPromises)

    return json({ success: true, notified: subs.length }, 200, req)

  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status, req)
    }
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
