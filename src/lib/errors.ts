// Normalizes an unknown thrown value into an Error, preserving a `.message`
// when present (Supabase errors are plain objects, not Error instances).
export function toError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string') return new Error(message)
  }
  return new Error(String(err))
}
