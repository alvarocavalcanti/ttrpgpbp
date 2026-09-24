import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import {
  buildCorsHeaders,
  buildImageMetadata,
  evaluateUploadGuards,
  isValidUploadPath,
} from "./logic.ts"

// Origin allowlist for CORS. Reads the ALLOWED_ORIGINS secret (comma separated)
// if set; otherwise falls back to the shared defaults in logic.ts.
function corsHeaders(req: Request): Record<string, string> {
  const env = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
  return buildCorsHeaders(req.headers.get("origin"), env.length > 0 ? env : undefined)
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

// Stores a GM's image into the private 'images' bucket. The only writer of
// stored objects (storage RLS has no client write policy), so the admin
// toggle, the size cap, the path shape, and GM-of-channel are all enforced
// here. Responses use 200 with a discriminated `status` so the browser client
// can tell a store from a refusal without parsing non-2xx bodies.
//
// Uploads are NOT scanned for illegal material: there is no content-safety
// provider configured (a paid service the app cannot afford), and user reports
// reviewed by the admin are the safety net instead (see Terms §7).
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !serviceKey || !anonKey) {
      console.error("Missing Supabase configuration")
      return json({ error: "Internal server error" }, 500, req)
    }

    // verify_jwt = true means the platform has already validated the token, but
    // we still resolve the authenticated user. Identity comes from the verified
    // JWT, never from the request body.
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, req)
    }
    const accessToken = authHeader.slice("Bearer ".length)

    const serviceClient = createClient(supabaseUrl, serviceKey)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401, req)
    }

    const form = await req.formData()
    const path = form.get("path")
    const channelId = form.get("channelId")
    const file = form.get("file")
    if (typeof path !== "string" || typeof channelId !== "string" || !(file instanceof File)) {
      return json({ error: "Invalid request" }, 400, req)
    }
    if (!isValidUploadPath(path, channelId)) {
      return json({ error: "Invalid upload path" }, 400, req)
    }

    // Uploads are GM-only (storage.objects has no client write policy). The
    // service-role client bypasses RLS, so the same rule is enforced here.
    const { data: channel } = await serviceClient
      .from("channels")
      .select("id, gm_id")
      .eq("id", channelId)
      .single()
    if (!channel || channel.gm_id !== user.id) {
      return json({ error: "Not authorized" }, 403, req)
    }

    // Server-side gate mirroring the DB store-time trigger: disabled or
    // oversized uploads are refused here too. Checked before the bytes are
    // buffered. Fail closed if the settings cannot be read.
    const { data: settingRows, error: settingsError } = await serviceClient
      .from("app_settings")
      .select("key,value")
      .in("key", ["image_uploading_enabled", "image_max_size_mb"])
    if (settingsError) {
      console.error("Reading image upload settings failed:", settingsError)
      return json({ error: "Image uploads are temporarily unavailable." }, 503, req)
    }
    const guard = evaluateUploadGuards(settingRows ?? [], file.size)
    if (guard === "disabled") {
      return json({ error: "Image uploads are disabled" }, 403, req)
    }
    if (guard === "too_large") {
      return json({ error: "Image exceeds the size limit" }, 413, req)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) {
      return json({ error: "Empty upload" }, 400, req)
    }

    const metadata = buildImageMetadata(form.get("width"), form.get("height"))
    const { error: uploadError } = await serviceClient.storage
      .from("images")
      .upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
        // Persist the intrinsic size so the chat can reserve the image's box
        // before it loads (mirrors the old client-side upload).
        ...(metadata ? { metadata } : {}),
      })
    if (uploadError) {
      console.error("Storage upload failed:", uploadError)
      return json({ error: "Internal server error" }, 500, req)
    }

    return json({ status: "stored", path }, 200, req)
  } catch (err) {
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
