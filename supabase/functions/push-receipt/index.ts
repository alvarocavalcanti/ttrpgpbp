import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { ReceiptSchema, applyReceipt } from "./logic.ts"
import type { ReceiptDb } from "./logic.ts"

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

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
    const outcome = await applyReceipt(
      serviceClient as unknown as ReceiptDb,
      parsed.data,
      req.headers.get("user-agent")?.slice(0, 300) ?? null
    )

    if (outcome === "unknown") return new Response("Unknown subscription", { status: 401 })
    if (outcome === "error") return new Response("Internal server error", { status: 500 })
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error("push-receipt error:", err)
    return new Response("Internal server error", { status: 500 })
  }
})
