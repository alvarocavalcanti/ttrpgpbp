import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyWebPushError, sendWithRetry } from './deliver.ts'

describe('classifyWebPushError', () => {
  it('classifies 404 and 410 as invalid', () => {
    expect(classifyWebPushError({ statusCode: 404 })).toBe('invalid')
    expect(classifyWebPushError({ statusCode: 410 })).toBe('invalid')
  })

  it('classifies 5xx as transient', () => {
    expect(classifyWebPushError({ statusCode: 500 })).toBe('transient')
    expect(classifyWebPushError({ statusCode: 503 })).toBe('transient')
  })

  it('classifies other 4xx as permanent failures', () => {
    expect(classifyWebPushError({ statusCode: 400 })).toBe('other')
    expect(classifyWebPushError({ statusCode: 401 })).toBe('other')
    expect(classifyWebPushError({ statusCode: 413 })).toBe('other')
  })

  it('classifies transport errors without a status code as transient', () => {
    expect(classifyWebPushError(new TypeError('fetch failed'))).toBe('transient')
    expect(classifyWebPushError({ message: 'network down' })).toBe('transient')
    expect(classifyWebPushError(undefined)).toBe('transient')
    expect(classifyWebPushError(null)).toBe('transient')
  })
})

describe('sendWithRetry', () => {
  let send: ReturnType<typeof vi.fn>
  const sub = { endpoint: 'https://push.example.com/x' }
  const payload = '{"title":"hi"}'

  beforeEach(() => {
    vi.useFakeTimers()
    send = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function run() {
    const promise = sendWithRetry(send, sub, payload, { maxAttempts: 3, backoffMs: 100 })
    await vi.advanceTimersByTimeAsync(1000)
    return promise
  }

  it('returns sent when the first attempt succeeds', async () => {
    send.mockResolvedValueOnce(undefined)
    await expect(run()).resolves.toEqual({ status: 'sent' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not retry invalid (404/410) subscriptions', async () => {
    send.mockRejectedValueOnce({ statusCode: 404 })
    await expect(run()).resolves.toEqual({ status: 'invalid' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not retry permanent client failures', async () => {
    send.mockRejectedValueOnce({ statusCode: 401 })
    await expect(run()).resolves.toEqual({ status: 'failed' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures and returns sent once one succeeds', async () => {
    send.mockRejectedValueOnce({ statusCode: 503 })
    send.mockRejectedValueOnce({ statusCode: 500 })
    send.mockResolvedValueOnce(undefined)
    await expect(run()).resolves.toEqual({ status: 'sent' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('retries transport errors and reports transient after exhausting attempts', async () => {
    send.mockRejectedValue(new TypeError('fetch failed'))
    await expect(run()).resolves.toEqual({ status: 'transient' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('reports transient after exhausting retries', async () => {
    send.mockRejectedValue({ statusCode: 500 })
    await expect(run()).resolves.toEqual({ status: 'transient' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('backs off exponentially between attempts', async () => {
    vi.useRealTimers()
    const order: string[] = []
    send.mockImplementationOnce(async () => {
      order.push('first')
      throw { statusCode: 500 }
    })
    send.mockImplementationOnce(async () => {
      order.push('second')
      throw { statusCode: 500 }
    })
    send.mockImplementationOnce(async () => {
      order.push('third')
    })

    const startedAt = Date.now()
    await sendWithRetry(send, sub, payload, { maxAttempts: 3, backoffMs: 50 })
    const elapsed = Date.now() - startedAt

    expect(order).toEqual(['first', 'second', 'third'])
    // 50ms + 100ms of backoff, with a safety margin for test scheduling.
    expect(elapsed).toBeGreaterThanOrEqual(140)
  })
})
