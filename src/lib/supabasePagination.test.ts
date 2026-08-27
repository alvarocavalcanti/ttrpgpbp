import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './supabasePagination'

describe('fetchAllRows', () => {
  function pagedQuery(total: number) {
    return {
      range: vi.fn().mockImplementation((from: number, to: number) =>
        Promise.resolve({
          data: Array.from({ length: total }, (_, i) => ({ id: i })).slice(from, to + 1),
          error: null,
        }),
      ),
    }
  }

  it('collects every row across multiple pages', async () => {
    const rows = await fetchAllRows(pagedQuery(2500) as any, 1000)
    expect(rows).toHaveLength(2500)
  })

  it('returns rows from a single short page', async () => {
    const rows = await fetchAllRows(pagedQuery(3) as any, 1000)
    expect(rows.map(r => (r as any).id)).toEqual([0, 1, 2])
  })

  it('returns an empty array for no rows', async () => {
    const rows = await fetchAllRows(pagedQuery(0) as any, 1000)
    expect(rows).toEqual([])
  })

  it('throws when a page errors', async () => {
    const query = { range: vi.fn().mockResolvedValue({ data: null, error: new Error('db down') }) }
    await expect(fetchAllRows(query as any, 1000)).rejects.toThrow('db down')
  })

  it.each([0, -1, 1.5, 1001])('rejects an invalid pageSize of %s', async (pageSize) => {
    await expect(fetchAllRows(pagedQuery(5) as any, pageSize)).rejects.toThrow(RangeError)
  })

  it('accepts the boundary page sizes of 1 and 1000', async () => {
    await expect(fetchAllRows(pagedQuery(1) as any, 1)).resolves.toHaveLength(1)
    await expect(fetchAllRows(pagedQuery(1000) as any, 1000)).resolves.toHaveLength(1000)
  })
})