// Pure logic for the delete-account edge function. Kept dependency-free so it
// can run in the Deno edge function and in vitest.

export type DeletionDecision =
  | { allow: true }
  | { allow: false; status: number; reason: string }

// The sole server_admin can't self-delete: it would leave the app without an
// admin (profiles.server_admin is a singleton via partial unique index).
export function evaluateDeletion(isServerAdmin: boolean): DeletionDecision {
  if (isServerAdmin) {
    return {
      allow: false,
      status: 403,
      reason: 'Server admin cannot delete their own account. Transfer admin first.',
    }
  }
  return { allow: true }
}
