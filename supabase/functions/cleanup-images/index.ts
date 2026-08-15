import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { collectExpiredImages, type ListedImage } from "./logic.ts"

// Deploy with a daily schedule, e.g.:
//   supabase functions deploy cleanup-images --project-ref <ref> --schedule "0 3 * * *"
// Reads image_retention_days from app_settings; 0 (default) keeps images
// forever and the function no-ops.
const DAY_MS = 24 * 60 * 60 * 1000

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration")
      return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
    }

    const client = createClient(supabaseUrl, supabaseServiceKey)

    const { data: settingsRow } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "image_retention_days")
      .maybeSingle()
    const retentionDays = Number(settingsRow?.value ?? 0)
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return new Response(JSON.stringify({ deleted: 0, retentionDays: 0 }), { status: 200 })
    }

    const cutoffMs = Date.now() - retentionDays * DAY_MS
    const bucket = client.storage.from("images")
    const candidates: ListedImage[] = []

    // storage.list does not recurse; walk each channel folder (the object
    // path's first segment) in turn.
    const { data: channelDirs, error: dirError } = await bucket.list("", { limit: 1000, offset: 0 })
    if (dirError) throw dirError

    for (const dir of channelDirs ?? []) {
      if (!dir.id) continue
      const { data: files, error: fileError } = await bucket.list(dir.name, { limit: 1000, offset: 0 })
      if (fileError) throw fileError
      for (const file of files ?? []) {
        candidates.push({
          path: `${dir.name}/${file.name}`,
          lastModified: String(file.metadata?.lastModified ?? ""),
        })
      }
    }

    const expired = collectExpiredImages(candidates, cutoffMs)

    let deleted = 0
    for (let i = 0; i < expired.length; i += 500) {
      const batch = expired.slice(i, i + 500)
      const { error: removeError } = await bucket.remove(batch)
      if (removeError) throw removeError
      deleted += batch.length
    }

    return new Response(JSON.stringify({ deleted, retentionDays }), { status: 200 })
  } catch (err) {
    console.error("cleanup-images error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }
})
