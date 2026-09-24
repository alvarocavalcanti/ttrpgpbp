import { describe, it, expect } from 'vitest'
import { buildCorsHeaders, buildImageMetadata, evaluateUploadGuards, isAllowedOrigin, isJpegSignature, isValidUploadPath } from './logic'

const CHANNEL = '11111111-2222-3333-4444-555555555555'
const OTHER_CHANNEL = '99999999-2222-3333-4444-555555555555'
const FILE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('isValidUploadPath', () => {
  it('accepts a well-formed path in the claimed channel', () => {
    expect(isValidUploadPath(`${CHANNEL}/message/${FILE}.jpg`, CHANNEL)).toBe(true)
    expect(isValidUploadPath(`${CHANNEL}/avatar/${FILE}.jpg`, CHANNEL)).toBe(true)
  })

  it('rejects a path whose channel does not match the claimed channel', () => {
    expect(isValidUploadPath(`${OTHER_CHANNEL}/message/${FILE}.jpg`, CHANNEL)).toBe(false)
  })

  it('rejects traversal and unknown folders', () => {
    expect(isValidUploadPath(`${CHANNEL}/../message/${FILE}.jpg`, CHANNEL)).toBe(false)
    expect(isValidUploadPath(`${CHANNEL}/evil/${FILE}.jpg`, CHANNEL)).toBe(false)
  })

  it('rejects non-jpg extensions and malformed uuids', () => {
    expect(isValidUploadPath(`${CHANNEL}/message/${FILE}.png`, CHANNEL)).toBe(false)
    expect(isValidUploadPath(`${CHANNEL}/message/not-a-uuid.jpg`, CHANNEL)).toBe(false)
  })
})

describe('isAllowedOrigin', () => {
  it('allows the deployed origins', () => {
    expect(isAllowedOrigin('https://rolebypost.com')).toBe(true)
  })

  it('allows Cloudflare Pages preview origins', () => {
    expect(isAllowedOrigin('https://abc123.ttrpgpbp.pages.dev')).toBe(true)
  })

  it('rejects unknown origins', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false)
  })
})

describe('buildCorsHeaders', () => {
  it('allows every header the Supabase browser client sends', () => {
    const allowed = buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Headers']
    expect(allowed).toContain('x-client-info')
    expect(allowed).toContain('authorization')
    expect(allowed).toContain('apikey')
    expect(allowed).toContain('content-type')
  })

  it('allows POST and the preflight OPTIONS method', () => {
    const methods = buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Methods']
    expect(methods).toContain('POST')
    expect(methods).toContain('OPTIONS')
  })

  it('echoes an allowed origin but not a disallowed one', () => {
    expect(buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Origin']).toBe('https://rolebypost.com')
    expect(buildCorsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('omits Allow-Origin when the request has no Origin', () => {
    expect(buildCorsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('honours an env allowlist override', () => {
    expect(buildCorsHeaders('https://other.example.com', ['https://other.example.com'])['Access-Control-Allow-Origin']).toBe('https://other.example.com')
    expect(buildCorsHeaders('https://rolebypost.com', ['https://other.example.com'])['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('isJpegSignature', () => {
  it('accepts the JPEG SOI marker', () => {
    expect(isJpegSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  it('rejects short, empty, and non-JPEG payloads', () => {
    expect(isJpegSignature(new Uint8Array([]))).toBe(false)
    expect(isJpegSignature(new Uint8Array([0xff, 0xd8]))).toBe(false)
    expect(isJpegSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(isJpegSignature(new Uint8Array([0xff, 0xd8, 0x00]))).toBe(false)
  })
})

describe('buildImageMetadata', () => {
  it('parses present dimensions', () => {
    expect(buildImageMetadata('512', '288')).toEqual({ width: 512, height: 288 })
  })

  it('treats a missing dimension as absent rather than zero', () => {
    expect(buildImageMetadata(null, null)).toBeUndefined()
    expect(buildImageMetadata('512', null)).toBeUndefined()
    expect(buildImageMetadata(undefined, undefined)).toBeUndefined()
  })

  it('rejects non-positive and non-numeric dimensions', () => {
    expect(buildImageMetadata('0', '288')).toBeUndefined()
    expect(buildImageMetadata('-1', '288')).toBeUndefined()
    expect(buildImageMetadata('abc', '288')).toBeUndefined()
    expect(buildImageMetadata('Infinity', '288')).toBeUndefined()
  })
})

describe('evaluateUploadGuards', () => {
  const MB = 1024 * 1024

  it('treats missing settings as disabled with the trigger defaults', () => {
    expect(evaluateUploadGuards([], 1)).toBe('disabled')
    expect(evaluateUploadGuards([{ key: 'image_max_size_mb', value: 5 }], 1)).toBe('disabled')
  })

  it('accepts an enabled upload within the default 5 MB cap', () => {
    expect(evaluateUploadGuards([{ key: 'image_uploading_enabled', value: true }], 5 * MB)).toBe('ok')
  })

  it('rejects an enabled upload a byte over the default 5 MB cap', () => {
    expect(evaluateUploadGuards([{ key: 'image_uploading_enabled', value: true }], 5 * MB + 1)).toBe('too_large')
  })

  it('honors the configured cap', () => {
    const rows = [
      { key: 'image_uploading_enabled', value: true },
      { key: 'image_max_size_mb', value: 1 },
    ]
    expect(evaluateUploadGuards(rows, MB)).toBe('ok')
    expect(evaluateUploadGuards(rows, MB + 1)).toBe('too_large')
  })

  it('defaults a null or garbage cap to 5 MB instead of coercing', () => {
    const rows = [{ key: 'image_uploading_enabled', value: true }, { key: 'image_max_size_mb', value: null }]
    expect(evaluateUploadGuards(rows, 5 * MB)).toBe('ok')
    expect(evaluateUploadGuards(rows, 5 * MB + 1)).toBe('too_large')
    const garbage = [{ key: 'image_uploading_enabled', value: true }, { key: 'image_max_size_mb', value: 'abc' }]
    expect(evaluateUploadGuards(garbage, 5 * MB + 1)).toBe('too_large')
  })

  it('accepts string-typed settings from legacy rows', () => {
    const rows = [
      { key: 'image_uploading_enabled', value: 'true' },
      { key: 'image_max_size_mb', value: '2' },
    ]
    expect(evaluateUploadGuards(rows, 2 * MB)).toBe('ok')
    expect(evaluateUploadGuards(rows, 2 * MB + 1)).toBe('too_large')
  })

  it('prefers disabled over oversized', () => {
    expect(evaluateUploadGuards([{ key: 'image_uploading_enabled', value: false }], 100 * MB)).toBe('disabled')
  })
})
