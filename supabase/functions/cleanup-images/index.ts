import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"
import { isAuthorizedCleanupRequest, listAllObjects, runCleanup, type ListedImage, type ListedObject } from "./logic.ts"

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  const expectedSecret = Deno.env.get("CLEANUP_IMAGES_SECRET")
  if (!expectedSecret) {
    console.error("cleanup-images is not configured with CLEANUP_IMAGES_SECRET")
    return jsonResponse({ error: "Internal server error" }, 500)
  }

  if (req.method !== "POST") {
    console.warn("cleanup-images rejected non-POST request")
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  if (!isAuthorizedCleanupRequest(req, expectedSecret)) {
    console.warn("cleanup-images rejected unauthorized request")
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration")
      return jsonResponse({ error: "Internal server error" }, 500)
    }

    const client = createClient(supabaseUrl, supabaseServiceKey)
    const bucket = client.storage.from("images")

    const result = await runCleanup({
      getRetentionDays: async () => {
        const { data, error } = await client
          .from("app_settings")
          .select("value")
          .eq("key", "image_retention_days")
          .maybeSingle()
        if (error) throw error
        return Number(data?.value ?? 0)
      },
      listImages: async () => {
        const candidates: ListedImage[] = []

        // storage.list returns { data, error }; adapt to the pure helper's
        // array shape, then walk each channel folder (the object path's first
        // segment) in turn, paginating past the 1000-object cap.
        const listBucket = async (path: string, options: { limit: number; offset: number }): Promise<ListedObject[]> => {
          const { data, error } = await bucket.list(path, options)
          if (error) throw error
          return (data ?? []) as ListedObject[]
        }

        const channelDirs = await listAllObjects(listBucket, "")

        for (const dir of channelDirs) {
          if (!dir.id) continue
          const files = await listAllObjects(listBucket, dir.name)
          for (const file of files) {
            candidates.push({
              path: `${dir.name}/${file.name}`,
              lastModified: String(file.metadata?.lastModified ?? ""),
            })
          }
        }
        return candidates
      },
      auditBatch: async ({ runId, retentionDays, cutoffAt, objectPaths }) => {
        const { data, error } = await client
          .from("image_cleanup_audit")
          .insert({
            run_id: runId,
            retention_days: retentionDays,
            cutoff_at: cutoffAt,
            object_paths: objectPaths,
            status: "pending",
          })
          .select("id")
          .single()
        if (error || !data) throw error ?? new Error("Failed to create cleanup audit row")
        return String(data.id)
      },
      markBatchDeleted: async (auditId) => {
        const { error } = await client
          .from("image_cleanup_audit")
          .update({ status: "deleted", completed_at: new Date().toISOString() })
          .eq("id", auditId)
        if (error) throw error
      },
      markBatchFailed: async (auditId, errorMessage) => {
        const { error } = await client
          .from("image_cleanup_audit")
          .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
          .eq("id", auditId)
        if (error) console.error("Failed to mark cleanup audit row:", error)
      },
      removeImages: async (paths) => {
        const { error } = await bucket.remove(paths)
        if (error) throw error
      },
    })

    return jsonResponse(result, 200)
  } catch (err) {
    console.error("cleanup-images error:", err)
    return jsonResponse({ error: "Internal server error" }, 500)
  }
})
