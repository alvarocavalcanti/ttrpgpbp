import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import webPush from "npm:web-push@3.6.7"

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

    // The payload comes from a database webhook on the 'messages' or 'channel_members' table
    const payload = await req.json()
    const record = payload.record || payload // Handle both webhook format and direct invocation
    const table = payload.table || (record.content ? 'messages' : 'channel_members')

    let title = ''
    let body = ''
    let targetUserIds: string[] = []
    let url = ''

    if (table === 'messages') {
      const message = record
      if (!message || !message.channel_id || !message.sender_id) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      // Get channel info
      const { data: channel } = await supabase
        .from('channels')
        .select('name')
        .eq('id', message.channel_id)
        .single()

      // Get sender info
      const { data: sender } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', message.sender_id)
        .single()

      const senderName = sender?.display_name || 'Someone'
      const channelName = channel?.name || 'A channel'

      url = `/channel/${message.channel_id}`
      title = `New message in ${channelName}`
      body = `${senderName}: ${message.content}`
      
      if (message.type === 'scene') {
        title = `New Scene in ${channelName}`
        body = message.content
      } else if (message.type === 'dice_roll') {
        title = `${senderName} rolled dice`
      }

      if (message.whisper_to) {
        targetUserIds = [message.whisper_to]
        title = `New whisper from ${senderName}`
      } else {
        const { data: members } = await supabase
          .from('channel_members')
          .select('user_id')
          .eq('channel_id', message.channel_id)
        
        targetUserIds = (members || [])
          .map(m => m.user_id)
          .filter(uid => uid !== message.sender_id)
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

      const { data: channel } = await supabase
        .from('channels')
        .select('name')
        .eq('id', member.channel_id)
        .single()

      url = `/channel/${member.channel_id}`
      title = `It's your turn!`
      body = `It is now your turn in ${channel?.name || 'a channel'}.`
      targetUserIds = [member.user_id]
    } else {
      return new Response(JSON.stringify({ error: "Unknown table" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

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

    // Check if it's someone's turn (they became active player recently)
    // Wait, the active_player is updated separately from the message insert.
    // However, if the active_players changed, the client can call another function or we can
    // infer it here if we passed it in the payload. But we only trigger on messages.

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
