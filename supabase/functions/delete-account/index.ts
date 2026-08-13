import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { evaluateDeletion } from "./logic.ts"

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
    // we still resolve the authenticated user to authorize the deletion. The
    // user id comes from the verified JWT, never from the request body.
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, req)
    }
    const accessToken = authHeader.slice("Bearer ".length)

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401, req)
    }

    const { data: isServerAdmin } = await userClient.rpc("is_server_admin")
    const decision = evaluateDeletion(isServerAdmin === true)
    if (!decision.allow) {
      return json({ error: decision.reason }, decision.status, req)
    }

    // Deleting the auth.users row cascades to profiles, channel_members,
    // messages (sender SET NULL, whisper CASCADE), dice_rolls, reactions,
    // notification_preferences, and push_subscriptions. The user's GM channels
    // are orphaned (gm_id SET NULL) for server admin reclaim.
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error("deleteUser failed:", deleteError)
      return json({ error: "Internal server error" }, 500, req)
    }

    return json({ success: true }, 200, req)
  } catch (err) {
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
