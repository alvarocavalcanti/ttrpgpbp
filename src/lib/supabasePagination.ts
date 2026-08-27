import type { PostgrestError } from '@supabase/postgrest-js'

// A query that has been built up (select/eq/order) and can still be paged.
interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
}

// PostgREST caps each response at max_rows (1000). Page under that cap with
// offset .range() so large datasets are fully retrievable. The builder must
// carry a deterministic .order() so offset pagination stays stable.
export async function fetchAllRows<T>(query: RangeableQuery<T>, pageSize = 1000): Promise<T[]> {
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
