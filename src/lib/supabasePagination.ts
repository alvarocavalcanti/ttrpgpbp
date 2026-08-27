import type { PostgrestError } from '@supabase/postgrest-js'

// A query that has been built up (select/eq/order) and can still be paged.
interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
}

// PostgREST caps each response at max_rows (1000). Page under that cap with
// offset .range() so large datasets are fully retrievable. The builder must
// carry a deterministic .order() so offset pagination stays stable.
export async function fetchAllRows<T>(query: RangeableQuery<T>, pageSize = 1000): Promise<T[]> {
  // pageSize outside [1, 1000] either loops forever (0/negative) or stops before
  // the cap and silently drops rows (over PostgREST's max_rows of 1000).
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError(`pageSize must be an integer between 1 and 1000, got ${pageSize}`)
  }
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return rows
}
