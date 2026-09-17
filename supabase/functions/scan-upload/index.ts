import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { interpretSaferResponse, isAllowedOrigin, isValidUploadPath } from "./logic.ts"

// Origin allowlist for CORS. Reads the ALLOWED_ORIGINS secret (comma separated)
// if set; otherwise falls back to the shared defaults in logic.ts.
function checkAllowedOrigin(origin: string): boolean {
  const env = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
  return isAllowedOrigin(origin, env.length > 0 ? env : undefined)
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

// Thorn Safer: submit the image bytes for matching against the known-CSAM
// database. A populated `hashes` key means a match. The URL/key come from the
// SAFER_API_URL / SAFER_API_KEY secrets; confirm the request shape against
// https://safer.io when requesting API access.
async function submitToSafer(bytes: Uint8Array, apiUrl: string, apiKey: string): Promise<unknown> {
  const form = new FormData()
  form.append("file", new Blob([bytes]), "upload.jpg")
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    throw new Error(`Safer responded ${res.status}`)
  }
  return await res.json()
}

// Scans an image before it is stored. A match blocks the upload entirely (the
// object is never persisted), records the attempt, and suspends the uploader.
// Responses use 200 with a discriminated `status` so the browser client can
// tell a clean store from a block without parsing non-2xx bodies.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const saferKey = Deno.env.get("SAFER_API_KEY")
    const saferUrl = Deno.env.get("SAFER_API_URL") ?? "https://api.safer.io/v1/match"

    if (!supabaseUrl || !serviceKey || !anonKey) {
      console.error("Missing Supabase configuration")
      return json({ error: "Internal server error" }, 500, req)
    }

    // Fail closed: with no scanning provider configured, refuse to store an
    // image rather than persist it unscanned. Uploads stay disabled until the
    // operator configures SAFER_API_KEY.
    if (!saferKey) {
      console.error("SAFER_API_KEY is not configured; refusing upload")
      return json({ status: "unavailable" }, 200, req)
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

    // Uploads are GM-only (storage.objects write policies). The service-role
    // client bypasses RLS, so the same rule is enforced here.
    const { data: channel } = await serviceClient
      .from("channels")
      .select("gm_id")
      .eq("id", channelId)
      .single()
    if (!channel || channel.gm_id !== user.id) {
      return json({ error: "Not authorized" }, 403, req)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) {
      return json({ error: "Empty upload" }, 400, req)
    }

    const sha256 = await sha256Hex(bytes)
    const verdict = interpretSaferResponse(await submitToSafer(bytes, saferUrl, saferKey))

    if (verdict === "match") {
      // Never store the object. Record the attempt and suspend the uploader.
      await serviceClient.from("content_hashes").insert({
        object_path: path,
        channel_id: channelId,
        uploaded_by: user.id,
        sha256,
        safer_status: "match",
      })
      await serviceClient.from("audit_logs").insert({
        admin_id: null,
        action: "csam_match_blocked",
        target_id: user.id,
        details: { object_path: path, sha256 },
      })
      const { error: suspendError } = await serviceClient
        .from("profiles")
        .update({ is_suspended: true })
        .eq("id", user.id)
      if (suspendError) {
        console.error("Auto-suspend after CSAM match failed:", suspendError)
      }
      return json({ status: "blocked" }, 200, req)
    }

    const width = Number(form.get("width"))
    const height = Number(form.get("height"))
    const { error: uploadError } = await serviceClient.storage
      .from("images")
      .upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
        // Persist the intrinsic size so the chat can reserve the image's box
        // before it loads (mirrors the old client-side upload).
        ...(Number.isFinite(width) && Number.isFinite(height)
          ? { metadata: { width, height } }
          : {}),
      })
    if (uploadError) {
      console.error("Storage upload failed:", uploadError)
      return json({ error: "Internal server error" }, 500, req)
    }

    await serviceClient.from("content_hashes").insert({
      object_path: path,
      channel_id: channelId,
      uploaded_by: user.id,
      sha256,
      safer_status: "clear",
    })

    return json({ status: "stored", path }, 200, req)
  } catch (err) {
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
