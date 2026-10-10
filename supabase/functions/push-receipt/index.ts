import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { ReceiptSchema } from "./logic.ts"

// Receives device-side push delivery milestones from the service worker (and
// the page) and records them in push_client_log, closing the observability gap
// past "the push service accepted it". Authenticated by the per-subscription
// ack_token carried in that device's push payload — not a JWT, because a push
// can arrive while the app is closed and no session is available.
//
// The caller is a fire-and-forget beacon: the body is sent as text/plain (a
// CORS "simple request") so no preflight is needed and none of the responses
// are read. There are therefore no CORS headers — a browser blocks the caller
// from READING the reply, but the request still lands and the row is written.

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration")
      return new Response("Internal server error", { status: 500 })
    }

    let raw: unknown
    try {
      raw = JSON.parse(await req.text())
    } catch {
      return new Response("Invalid payload", { status: 400 })
    }

    const parsed = ReceiptSchema.safeParse(raw)
    if (!parsed.success) {
      return new Response("Invalid payload", { status: 400 })
    }
    const receipt = parsed.data

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // The ack_token gates the write: only a device that actually received a
    // push holds it. A mismatched token resolves to no row and is rejected.
    const { data: subscription, error: lookupError } = await serviceClient
      .from("push_subscriptions")
      .select("id, user_id")
      .eq("id", receipt.subscription_id)
      .eq("ack_token", receipt.ack_token)
      .maybeSingle()

    if (lookupError) {
      console.error(`push-receipt lookup failed: ${lookupError.message}`)
      return new Response("Internal server error", { status: 500 })
    }
    if (!subscription) {
      return new Response("Unknown subscription", { status: 401 })
    }

    const { error } = await serviceClient.from("push_client_log").insert({
      event_id: receipt.event_id ?? null,
      subscription_id: subscription.id,
      user_id: subscription.user_id,
      event_kind: receipt.event_kind ?? null,
      status: receipt.status,
      detail: receipt.detail ?? null,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    })
    if (error) {
      console.error(`push-receipt log write failed: ${error.message}`)
      return new Response("Internal server error", { status: 500 })
    }

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error("push-receipt error:", err)
    return new Response("Internal server error", { status: 500 })
  }
})
