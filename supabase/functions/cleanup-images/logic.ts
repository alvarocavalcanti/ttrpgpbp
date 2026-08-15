// Pure logic for the cleanup-images edge function. Kept dependency-free so it
// can run in the Deno edge function and in vitest.

export interface ListedImage {
  path: string
  lastModified: string
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
