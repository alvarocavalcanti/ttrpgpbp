import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import webPush from "npm:web-push@3.6.7"
import { resolvePushTargets, buildPushPayload, extractMentionUserIds, resolveMentionTargets, isAllowedOrigin } from "./filter.ts"
import { sendWithRetry } from "./deliver.ts"
import type { PushEvent, PushMember } from "./filter.ts"

// Origin allowlist for CORS. Reads the ALLOWED_ORIGINS secret (comma separated)
// if set; otherwise falls back to the shared defaults in filter.ts.
function checkAllowedOrigin(origin: string): boolean {
  const env = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
  return isAllowedOrigin(origin, env.length > 0 ? env : undefined)
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-push-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
  const origin = req.headers.get("origin")
  if (origin && checkAllowedOrigin(origin)) {
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

// Writes one delivery-outcome row per push so failures are queryable (#191).
// No message content, endpoints, or push keys — only ids and a status.
async function logDelivery(
  client: ReturnType<typeof createClient>,
  row: {
    event_id: string
    event_kind: string
    status: string
    user_id?: string
    subscription_id?: string
    error_category?: string
  }
): Promise<void> {
  const { error } = await client.from("push_delivery_log").insert(row)
  if (error) {
    console.error(`push delivery log write failed (event=${row.event_id} status=${row.status}):`, error.message)
  }
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

// Message events: the trigger supplies a message_id. Channel, sender, content,
// whisper target, and mentions are all read from the database. The trigger only
// fires for authenticated, RLS-passing inserts, so there is no caller identity
// to check here — the shared secret is the trust boundary.
async function buildMessageEvent(
  payload: Record<string, unknown>,
  serviceClient: ReturnType<typeof createClient>
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

  const members = fetchedMembers ?? []

  // Mentions are parsed from the persisted markdown chips, not trusted from the
  // request, so routing works for any caller.
  const mentionIds = resolveMentionTargets(
    extractMentionUserIds(message.content),
    members,
    message.sender_id
  )

  return {
    members,
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
      mention_user_ids: mentionIds.length > 0 ? mentionIds : undefined,
      gm_id: channel?.gm_id,
    },
  }
}

// Turn events: the trigger supplies a member_id. Only a false -> true
// is_active_player transition fires the trigger, so the member is always an
// active player here; the guard below keeps direct API misuse harmless.
async function buildTurnEvent(
  payload: Record<string, unknown>,
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
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration")
      return json({ error: "Internal server error" }, 500, req)
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Auth: only the DB trigger may call this function (verify_jwt is off).
    // The trigger signs its calls with a shared secret stored in
    // push_notification_config; the same value gates direct calls.
    const { data: configRows } = await serviceClient
      .from("push_notification_config")
      .select("key, value")
    const config = new Map<string, string>(
      (configRows ?? []).map((row: { key: string; value: string }) => [row.key, row.value])
    )
    const internalSecret = config.get("PUSH_INTERNAL_SECRET")
    if (!internalSecret || req.headers.get("x-push-secret") !== internalSecret) {
      return json({ error: "Unauthorized" }, 401, req)
    }

    const payload = await req.json() as Record<string, unknown>
    const table = payload.table

    let event: PushEvent
    let members: PushMember[]

    if (table === "messages") {
      const built = await buildMessageEvent(payload, serviceClient)
      event = built.event
      members = built.members
    } else if (table === "channel_members") {
      const built = await buildTurnEvent(payload, serviceClient)
      if (!built.isActivePlayer) {
        return json({ success: true, message: "Not an active player event" }, 200, req)
      }
      event = built.event
      members = built.members
    } else {
      return json({ error: "Unknown table" }, 400, req)
    }

    // Correlation id for this notification, shared across every delivery-log
    // row written below so a single push is traceable from trigger to device.
    const eventId = crypto.randomUUID()
    await logDelivery(serviceClient, { event_id: eventId, event_kind: event.kind, status: "invocation" })

    const { targetUserIds, title, body, url } = resolvePushTargets(event, members)

    if (targetUserIds.length === 0) {
      return json({ success: true, message: "No targets" }, 200, req)
    }

    const targetUserIdsArray = Array.from(targetUserIds)
    const pushEnabledUserIds: string[] = []
    const badgeEnabledById = new Map<string, boolean>()
    const unreadById = new Map<string, number>()
    const subs: any[] = []

    const BATCH_SIZE = 50

    for (let i = 0; i < targetUserIdsArray.length; i += BATCH_SIZE) {
      const batchIds = targetUserIdsArray.slice(i, i + BATCH_SIZE)

      const [{ data: prefs }, { data: unreadRows }, { data: batchSubs }] = await Promise.all([
        serviceClient.from("notification_preferences").select("user_id, push_enabled, badge_enabled").in("user_id", batchIds),
        serviceClient.rpc("get_unread_totals", { p_user_ids: batchIds }),
        serviceClient.from("push_subscriptions").select("*").in("user_id", batchIds)
      ])

      for (const uid of batchIds) {
        const p = prefs?.find(pref => pref.user_id === uid)
        const enabled = p ? p.push_enabled : true
        if (enabled) {
          pushEnabledUserIds.push(uid)
          badgeEnabledById.set(uid, p ? p.badge_enabled !== false : true)
        }
      }

      for (const row of unreadRows ?? []) {
        unreadById.set(row.user_id, row.unread_count)
      }

      if (batchSubs) {
        subs.push(...batchSubs.filter(sub => pushEnabledUserIds.includes(sub.user_id)))
      }
    }

    if (subs.length === 0) {
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

    const results: string[] = []
    const CONCURRENCY = 20

    for (let i = 0; i < subs.length; i += CONCURRENCY) {
      const chunk = subs.slice(i, i + CONCURRENCY)
      const pushPromises = chunk.map(async (sub) => {
        const pushPayload = JSON.stringify(buildPushPayload(
          { title, body, url },
          unreadById.get(sub.user_id) ?? 0,
          badgeEnabledById.get(sub.user_id) ?? true
        ))

        const outcome = await sendWithRetry(
          (subscription, payload) =>
            webPush.sendNotification(
              subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
              payload as string
            ),
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload
        )

        if (outcome.status === "sent") {
          await logDelivery(serviceClient, {
            event_id: eventId,
            event_kind: event.kind,
            status: "sent",
            user_id: sub.user_id,
            subscription_id: sub.id,
          })
          return outcome.status
        }

        if (outcome.status === "invalid") {
          await serviceClient
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id)
          await logDelivery(serviceClient, {
            event_id: eventId,
            event_kind: event.kind,
            status: "invalid",
            error_category: "invalid",
            user_id: sub.user_id,
            subscription_id: sub.id,
          })
          return outcome.status
        }

        await logDelivery(serviceClient, {
          event_id: eventId,
          event_kind: event.kind,
          status: outcome.status,
          error_category: outcome.status,
          user_id: sub.user_id,
          subscription_id: sub.id,
        })
        return outcome.status
      })
      
      const chunkResults = await Promise.all(pushPromises)
      results.push(...chunkResults)
    }

    // Report recipients actually notified, not everyone attempted.
    return json({ success: true, notified: results.filter(s => s === "sent").length }, 200, req)

  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status, req)
    }
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
