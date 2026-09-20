import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  function stubSecureContext(secure: boolean) {
    Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true })
  }

  function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, 'clipboard', {
      value: writeText ? { writeText } : undefined,
      configurable: true,
    })
  }

  function textareaCount() {
    return document.body.querySelectorAll('textarea').length
  }

  it('uses navigator.clipboard in a secure context', async () => {
    stubSecureContext(true)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const execCommand = vi.fn()
    document.execCommand = execCommand

    await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(execCommand).not.toHaveBeenCalled()
    expect(textareaCount()).toBe(0)
  })

  it('falls back to execCommand outside a secure context and cleans up the textarea', async () => {
    stubSecureContext(false)
    stubClipboard(undefined as never)
    document.execCommand = vi.fn().mockReturnValue(true)

    await copyToClipboard('fallback text')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(textareaCount()).toBe(0)
  })

  it('throws when execCommand returns false and removes the textarea', async () => {
    stubSecureContext(false)
    stubClipboard(undefined as never)
    document.execCommand = vi.fn().mockReturnValue(false)

    await expect(copyToClipboard('nope')).rejects.toThrow('execCommand returned false')
    expect(textareaCount()).toBe(0)
  })

  it('propagates a rejected navigator.clipboard write', async () => {
    stubSecureContext(true)
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)

    await expect(copyToClipboard('hello')).rejects.toThrow('denied')
    expect(textareaCount()).toBe(0)
  })

  it('falls back to execCommand when the clipboard API is absent even in a secure context', async () => {
    stubSecureContext(true)
    stubClipboard(undefined as never)
    document.execCommand = vi.fn().mockReturnValue(true)

    await copyToClipboard('no api')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(textareaCount()).toBe(0)
  })

  it('removes the textarea when execCommand throws', async () => {
    stubSecureContext(false)
    stubClipboard(undefined as never)
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('blocked')
    })

    await expect(copyToClipboard('boom')).rejects.toThrow('blocked')
    expect(textareaCount()).toBe(0)
  })
})
