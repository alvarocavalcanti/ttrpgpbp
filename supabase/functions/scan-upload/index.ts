import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import {
  attemptInsertFailureStatus,
  buildCsamAlertMessage,
  buildImageMetadata,
  evaluatePreScanGuards,
  interpretSaferResponse,
  isAllowedOrigin,
  isValidUploadPath,
  MAX_UPLOADS_PER_HOUR,
  SAFER_TIMEOUT_MS,
} from "./logic.ts"

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
// database. A populated `hashes` key means a match; anything unrecognized
// throws (see interpretSaferResponse). The URL/key come from the SAFER_API_URL
// / SAFER_API_KEY secrets; confirm the request shape against https://safer.io
// when requesting API access. The timeout stops a hanging provider pinning the
// invocation.
async function submitToSafer(bytes: Uint8Array, apiUrl: string, apiKey: string): Promise<unknown> {
  const form = new FormData()
  form.append("file", new Blob([bytes]), "upload.jpg")
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(SAFER_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Safer responded ${res.status}`)
  }
  return await res.json()
}

// Scans an image before it is stored. A match blocks the upload entirely (the
// object is never persisted), records the attempt, and suspends the uploader.
// Responses use 200 with a discriminated `status` so the browser client can
// tell a clean store from a block or a throttle without parsing non-2xx bodies.
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
      .select("id, name, gm_id")
      .eq("id", channelId)
      .single()
    if (!channel || channel.gm_id !== user.id) {
      return json({ error: "Not authorized" }, 403, req)
    }

    // Pre-scan gate mirroring the DB store-time trigger: disabled or
    // oversized uploads must never touch the paid provider. Checked before
    // the bytes are buffered. Fail closed if the settings cannot be read.
    const { data: settingRows, error: settingsError } = await serviceClient
      .from("app_settings")
      .select("key,value")
      .in("key", ["image_uploading_enabled", "image_max_size_mb"])
    if (settingsError) {
      console.error("Reading image upload settings failed:", settingsError)
      return json({ status: "unavailable" }, 200, req)
    }
    const preScanGuard = evaluatePreScanGuards(settingRows ?? [], file.size)
    if (preScanGuard === "disabled") {
      return json({ error: "Image uploads are disabled" }, 403, req)
    }
    if (preScanGuard === "too_large") {
      return json({ error: "Image exceeds the size limit" }, 413, req)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) {
      return json({ error: "Empty upload" }, 400, req)
    }

    // Rolling attempt cap: every attempt gets a content_hashes row, so this
    // bounds how much paid provider quota one GM can burn. Attempts that fail
    // validation above never reach here and are not counted.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await serviceClient
      .from("content_hashes")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by", user.id)
      .gte("created_at", since)
    if (countError) {
      console.error("Counting recent uploads failed:", countError)
    }
    if ((count ?? 0) >= MAX_UPLOADS_PER_HOUR) {
      return json({ status: "throttled" }, 200, req)
    }

    const sha256 = await sha256Hex(bytes)

    // Record the attempt before scanning, so a provider failure still leaves
    // provenance (an 'unscanned' row) and counts against the cap. The insert
    // is the quota gate: object_path is UNIQUE, so a replayed path returns
    // 23505 instead of burning provider quota uncounted; any other failure
    // degrades to unavailable rather than scanning without a counter row.
    const { error: attemptError } = await serviceClient.from("content_hashes").insert({
      object_path: path,
      channel_id: channelId,
      uploaded_by: user.id,
      sha256,
      safer_status: "unscanned",
    })
    if (attemptError) {
      console.error("Recording upload attempt failed:", attemptError)
      return json({ status: attemptInsertFailureStatus(attemptError.code) }, 200, req)
    }

    const verdict = interpretSaferResponse(await submitToSafer(bytes, saferUrl, saferKey))

    if (verdict === "match") {
      // Never store the object. Record the outcome and suspend the uploader.
      const { error: matchError } = await serviceClient
        .from("content_hashes")
        .update({ safer_status: "match" })
        .eq("object_path", path)
      if (matchError) {
        console.error("Marking scan result failed:", matchError)
      }

      const { error: auditError } = await serviceClient.from("audit_logs").insert({
        admin_id: null,
        action: "csam_match_blocked",
        target_id: user.id,
        details: { object_path: path, sha256 },
      })
      if (auditError) {
        console.error("Writing CSAM audit row failed:", auditError)
      }

      // Surface the duty the Terms §7 promise: post the match to the admin's
      // System thread (#562 P1). Best-effort — the audit row and the
      // content_hashes row above are the durable evidence, so an alert
      // failure must never change the block response.
      const { data: uploaderProfile } = await serviceClient
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle()
      const uploaderName = uploaderProfile?.display_name?.trim() || user.email || user.id
      try {
        const { error: alertError } = await serviceClient.rpc("post_system_message", {
          p_content: buildCsamAlertMessage({
            uploaderId: user.id,
            uploaderName,
            channelId,
            channelName: channel.name,
            objectPath: path,
            sha256,
            detectedAt: new Date().toISOString(),
          }),
        })
        if (alertError) {
          console.error("Posting CSAM system alert failed:", alertError)
        }
      } catch (alertErr) {
        console.error("Posting CSAM system alert failed:", alertErr)
      }

      // The service-role client has no auth.uid(), so the
      // prevent_self_suspension_change trigger does not block this write.
      const { error: suspendError } = await serviceClient
        .from("profiles")
        .update({ is_suspended: true })
        .eq("id", user.id)
      if (suspendError) {
        console.error("Auto-suspend after CSAM match failed:", suspendError)
      }
      return json({ status: "blocked" }, 200, req)
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

    const { error: clearError } = await serviceClient
      .from("content_hashes")
      .update({ safer_status: "clear" })
      .eq("object_path", path)
    if (clearError) {
      console.error("Marking scan result failed:", clearError)
    }

    return json({ status: "stored", path }, 200, req)
  } catch (err) {
    console.error("Function error:", err)
    return json({ error: "Internal server error" }, 500, req)
  }
})
