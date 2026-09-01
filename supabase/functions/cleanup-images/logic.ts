// Pure logic for the cleanup-images edge function. Kept dependency-free so it
// can run in the Deno edge function and in vitest.

export interface ListedImage {
  path: string
  lastModified: string
}

export interface CleanupAuditEntry {
  runId: string
  retentionDays: number
  cutoffAt: string
  objectPaths: string[]
}

export interface CleanupDependencies {
  getRetentionDays: () => Promise<number>
  listImages: () => Promise<ListedImage[]>
  auditBatch: (entry: CleanupAuditEntry) => Promise<string>
  markBatchDeleted: (auditId: string) => Promise<void>
  markBatchFailed: (auditId: string, errorMessage: string) => Promise<void>
  removeImages: (paths: string[]) => Promise<void>
}

export const CLEANUP_BATCH_SIZE = 500

export interface StorageListOptions {
  limit: number
  offset: number
}

export interface ListedObject {
  id?: string | null
  name: string
  metadata?: Record<string, unknown> | null
}

// storage.list caps each call at 1000 objects; page by offset until a short
// page so every object under the prefix is returned, not just the first 1000.
export async function listAllObjects(
  list: (path: string, options: StorageListOptions) => Promise<ListedObject[]>,
  path: string,
  pageSize = 1000,
): Promise<ListedObject[]> {
  const all: ListedObject[] = []
  let offset = 0
  for (;;) {
    const page = await list(path, { limit: pageSize, offset })
    all.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return all
}

// Storage directories have id === null; files have a non-null id. The root
// listing is the channel folders, so walk only the id === null entries and
// skip stray files sitting at the root (id !== null).
export async function listChannelImages(
  list: (path: string, options: StorageListOptions) => Promise<ListedObject[]>,
): Promise<ListedImage[]> {
  const dirs = await listAllObjects(list, "")
  const images: ListedImage[] = []
  for (const dir of dirs) {
    if (dir.id !== null) continue
    const files = await listAllObjects(list, dir.name)
    for (const file of files) {
      images.push({
        path: `${dir.name}/${file.name}`,
        lastModified: String(file.metadata?.lastModified ?? ""),
      })
    }
  }
  return images
}

export type SecretCompare = (provided: string, expected: string) => boolean

// `compare` defaults to strict equality; the Deno entry point (index.ts)
// injects @std/crypto's timingSafeEqual for a constant-time check. Kept as a
// parameter so this module stays dependency-free and runnable in vitest.
export function isAuthorizedCleanupRequest(
  request: Request,
  expectedSecret: string | undefined,
  compare: SecretCompare = (a, b) => a === b,
): boolean {
  const provided = request.headers.get('x-cleanup-secret')
  return Boolean(expectedSecret && provided && compare(provided, expectedSecret))
}

export function positiveRetentionDays(value: unknown): number {
  const days = Number(value)
  return Number.isInteger(days) && days > 0 ? days : 0
}

export function splitCleanupBatches(paths: string[], batchSize = CLEANUP_BATCH_SIZE): string[][] {
  const batches: string[][] = []
  for (let i = 0; i < paths.length; i += batchSize) {
    batches.push(paths.slice(i, i + batchSize))
  }
  return batches
}

export async function runCleanup(
  dependencies: CleanupDependencies,
  nowMs = Date.now(),
  runId = crypto.randomUUID(),
): Promise<{ deleted: number; retentionDays: number }> {
  const retentionDays = positiveRetentionDays(await dependencies.getRetentionDays())
  if (retentionDays === 0) return { deleted: 0, retentionDays: 0 }

  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000
  const expired = collectExpiredImages(await dependencies.listImages(), cutoffMs)
  let deleted = 0

  for (const batch of splitCleanupBatches(expired)) {
    const auditId = await dependencies.auditBatch({
      runId,
      retentionDays,
      cutoffAt: new Date(cutoffMs).toISOString(),
      objectPaths: batch,
    })

    try {
      await dependencies.removeImages(batch)
      await dependencies.markBatchDeleted(auditId)
      deleted += batch.length
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await dependencies.markBatchFailed(auditId, errorMessage)
      throw error
    }
  }

  return { deleted, retentionDays }
}

// Returns the object paths older than the cutoff. Images without a usable
// lastModified are never deleted (a missing date must not nuke a file).
export function collectExpiredImages(files: ListedImage[], cutoffMs: number): string[] {
  return files
    .filter(f => {
      const t = new Date(f.lastModified).getTime()
      return Number.isFinite(t) && t > 0 && t < cutoffMs
    })
    .map(f => f.path)
}
