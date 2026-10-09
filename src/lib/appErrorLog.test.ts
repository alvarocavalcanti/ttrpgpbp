import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reportAppError } from './appErrorLog'
import { supabase } from './supabase'
import { captureException } from './sentry'
import { isAutomatedBrowser } from './automation'

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('./sentry', () => ({ captureException: vi.fn() }))
vi.mock('./automation', () => ({ isAutomatedBrowser: vi.fn(() => false) }))

const rpc = vi.mocked(supabase.rpc)
const capture = vi.mocked(captureException)
const automated = vi.mocked(isAutomatedBrowser)

function lastRpcArg(): Record<string, unknown> {
  return rpc.mock.calls[0][1] as Record<string, unknown>
}

describe('reportAppError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    automated.mockReturnValue(false)
    rpc.mockResolvedValue({ data: null, error: null } as never)
    capture.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.replaceState({}, '', '/join/123?code=secret')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the message with a pathname-only route (no query string)', () => {
    reportAppError(new Error('boom'))

    expect(rpc).toHaveBeenCalledWith('report_app_error', expect.objectContaining({ p_message: 'boom' }))
    expect(lastRpcArg().p_route).toBe('/join/123')
  })

  it('merges the caller detail with the stack', () => {
    reportAppError(new Error('boom'), { detail: { where: 'join' } })

    const arg = lastRpcArg()
    expect(arg.p_route).toBe('/join/123')
    const detail = arg.p_detail as Record<string, unknown>
    expect(detail.where).toBe('join')
    expect(String(detail.stack)).toContain('boom')
    expect(String(detail.stack).length).toBeLessThanOrEqual(1500)
  })

  it('mirrors the error to Sentry', () => {
    reportAppError(new Error('boom'), { detail: { where: 'join' } })

    expect(capture).toHaveBeenCalledWith(expect.any(Error), { where: 'join' })
  })

  it('never throws when the report fails', async () => {
    rpc.mockRejectedValue(new Error('network'))

    expect(() => reportAppError(new Error('boom'))).not.toThrow()
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to report app error:', expect.any(Error))
    })
  })

  it('no-ops in automated browsers', () => {
    automated.mockReturnValue(true)

    reportAppError(new Error('boom'))

    expect(rpc).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })
})
