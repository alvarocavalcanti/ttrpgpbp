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

  it('merges the caller component stack with the error stack, truncating each', () => {
    reportAppError(new Error('boom'), { componentStack: 'at <Bomb>' })

    const arg = lastRpcArg()
    expect(arg.p_route).toBe('/join/123')
    const detail = arg.p_detail as Record<string, unknown>
    expect(detail.componentStack).toBe('at <Bomb>')
    expect(String(detail.stack)).toContain('boom')
    expect(Object.keys(detail).sort()).toEqual(['componentStack', 'stack'])
  })

  it('mirrors the error to Sentry with the component stack', () => {
    reportAppError(new Error('boom'), { componentStack: 'at <Bomb>' })

    expect(capture).toHaveBeenCalledWith(expect.any(Error), { componentStack: 'at <Bomb>' })
  })

  it('redacts embedded row values before either sink sees the message', () => {
    reportAppError(new Error('duplicate key value violates unique constraint "x" Key (email)=(secret@example.com) already exists'))

    expect(lastRpcArg().p_message).not.toContain('secret@example.com')
    const sentryError = capture.mock.calls[0][0] as Error
    expect(sentryError.message).not.toContain('secret@example.com')
    expect(sentryError.message).toContain('Key [redacted]')
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
