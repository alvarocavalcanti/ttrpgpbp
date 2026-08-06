import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import webPush from "npm:web-push@3.6.7"
import { resolvePushTargets } from "./filter.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // The payload comes from the client invoking this function directly
    const payload = await req.json()
    const record = payload.record || payload
    const table = payload.table || (record.content ? 'messages' : 'channel_members')

    let event
    let channelId: string
    let members: Array<{ user_id: string; notify_all_messages?: boolean; notify_gm_messages?: boolean; notify_turn?: boolean; is_blocked?: boolean }> | null = null

    if (table === 'messages') {
      const message = record
      if (!message || !message.channel_id || !message.sender_id) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      channelId = message.channel_id

      const [{ data: channel }, { data: sender }, { data: whisperTarget }] = await Promise.all([
        supabase
          .from('channels')
          .select('name, gm_id')
          .eq('id', channelId)
          .single(),
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', message.sender_id)
          .single(),
        message.whisper_to
          ? supabase
              .from('profiles')
              .select('display_name')
              .eq('id', message.whisper_to)
              .single()
          : Promise.resolve({ data: null })
      ])

      const { data: fetchedMembers } = await supabase
        .from('channel_members')
        .select('user_id, notify_all_messages, notify_gm_messages, notify_turn, is_blocked')
        .eq('channel_id', channelId)

      members = fetchedMembers

      event = {
        kind: 'message',
        channel_id: channelId,
        channel_name: channel?.name,
        sender_id: message.sender_id,
        sender_name: sender?.display_name,
        content: message.content,
        type: message.type,
        whisper_to: message.whisper_to,
        whisper_target_name: whisperTarget?.display_name,
        mention_user_ids: message.mention_user_ids,
        gm_id: channel?.gm_id
      }
    } else if (table === 'channel_members') {
      const member = record
      
      // We only care if they just became the active player
      if (!member.is_active_player) {
        return new Response(JSON.stringify({ success: true, message: "Not an active player event" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // If payload has an old record, and they were already active, ignore
      if (payload.old && payload.old.is_active_player) {
         return new Response(JSON.stringify({ success: true, message: "Already active" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      channelId = member.channel_id

      const { data: channel } = await supabase
        .from('channels')
        .select('name')
        .eq('id', channelId)
        .single()

      const { data: fetchedTurnMembers } = await supabase
        .from('channel_members')
        .select('user_id, notify_all_messages, notify_gm_messages, notify_turn, is_blocked')
        .eq('channel_id', channelId)

      members = fetchedTurnMembers

      event = {
        kind: 'turn',
        channel_id: channelId,
        channel_name: channel?.name,
        user_id: member.user_id
      }
    } else {
      return new Response(JSON.stringify({ error: "Unknown table" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { targetUserIds, title, body, url } = resolvePushTargets(event, members || [])

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No targets" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get notification preferences and subscriptions for these users
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id, push_enabled')
      .in('user_id', targetUserIds)

    const pushEnabledUserIds = targetUserIds.filter(uid => {
      const p = prefs?.find(pref => pref.user_id === uid)
      return p ? p.push_enabled : true // Default to true if no preference set
    })

    if (pushEnabledUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Push disabled for all targets" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', pushEnabledUserIds)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active subscriptions" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const vapidPublic = Deno.env.get('VITE_VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!vapidPublic || !vapidPrivate) {
      console.warn("VAPID keys not configured")
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    webPush.setVapidDetails(
      'mailto:admin@example.com',
      vapidPublic,
      vapidPrivate
    )

    const pushPromises = subs.map(async (sub) => {
      const pushPayload = JSON.stringify({
        title,
        body,
        url
      })

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
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id)
        }
      }
    })

    await Promise.all(pushPromises)

    return new Response(JSON.stringify({ success: true, notified: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error("Function error:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
