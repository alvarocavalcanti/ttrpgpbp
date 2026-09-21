import { describe, it, expect } from 'vitest'
import { attemptInsertFailureStatus, buildCsamAlertMessage, buildImageMetadata, evaluatePreScanGuards, interpretSaferResponse, isAllowedOrigin, isValidUploadPath } from './logic'

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

describe('interpretSaferResponse', () => {
  it('treats an explicit empty hashes list as clear', () => {
    expect(interpretSaferResponse({ hashes: [] })).toBe('clear')
  })

  it('treats an explicit empty hashes object as clear', () => {
    expect(interpretSaferResponse({ hashes: {} })).toBe('clear')
  })

  it('treats an explicit false hashes value as clear', () => {
    expect(interpretSaferResponse({ hashes: false })).toBe('clear')
    expect(interpretSaferResponse({ hashes: null })).toBe('clear')
  })

  it('treats a populated hashes list as a match', () => {
    expect(interpretSaferResponse({ hashes: [{ matchDistance: 3 }] })).toBe('match')
  })

  it('treats a populated hashes object as a match', () => {
    expect(interpretSaferResponse({ hashes: { pdq: 'abc' } })).toBe('match')
  })

  it('fails closed on payloads that carry no hashes key', () => {
    expect(() => interpretSaferResponse({})).toThrow('Unrecognized Safer response')
    expect(() => interpretSaferResponse({ data: { hashes: ['x'] } })).toThrow('Unrecognized Safer response')
  })

  it('fails closed on an unknown shape that looks like a match', () => {
    expect(() => interpretSaferResponse({ match: true })).toThrow('Unrecognized Safer response')
  })

  it('fails closed on non-object payloads', () => {
    expect(() => interpretSaferResponse('nope')).toThrow('Unrecognized Safer response')
    expect(() => interpretSaferResponse(null)).toThrow('Unrecognized Safer response')
    expect(() => interpretSaferResponse(['hashes'])).toThrow('Unrecognized Safer response')
  })

  it('fails closed on a scalar hashes value', () => {
    expect(() => interpretSaferResponse({ hashes: 'yes' })).toThrow('Unrecognized Safer response')
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

describe('evaluatePreScanGuards', () => {
  const MB = 1024 * 1024

  it('treats missing settings as disabled with the trigger defaults', () => {
    expect(evaluatePreScanGuards([], 1)).toBe('disabled')
    expect(evaluatePreScanGuards([{ key: 'image_max_size_mb', value: 5 }], 1)).toBe('disabled')
  })

  it('accepts an enabled upload within the default 5 MB cap', () => {
    expect(evaluatePreScanGuards([{ key: 'image_uploading_enabled', value: true }], 5 * MB)).toBe('ok')
  })

  it('rejects an enabled upload a byte over the default 5 MB cap', () => {
    expect(evaluatePreScanGuards([{ key: 'image_uploading_enabled', value: true }], 5 * MB + 1)).toBe('too_large')
  })

  it('honors the configured cap', () => {
    const rows = [
      { key: 'image_uploading_enabled', value: true },
      { key: 'image_max_size_mb', value: 1 },
    ]
    expect(evaluatePreScanGuards(rows, MB)).toBe('ok')
    expect(evaluatePreScanGuards(rows, MB + 1)).toBe('too_large')
  })

  it('defaults a null or garbage cap to 5 MB instead of coercing', () => {
    const rows = [{ key: 'image_uploading_enabled', value: true }, { key: 'image_max_size_mb', value: null }]
    expect(evaluatePreScanGuards(rows, 5 * MB)).toBe('ok')
    expect(evaluatePreScanGuards(rows, 5 * MB + 1)).toBe('too_large')
    const garbage = [{ key: 'image_uploading_enabled', value: true }, { key: 'image_max_size_mb', value: 'abc' }]
    expect(evaluatePreScanGuards(garbage, 5 * MB + 1)).toBe('too_large')
  })

  it('accepts string-typed settings from legacy rows', () => {
    const rows = [
      { key: 'image_uploading_enabled', value: 'true' },
      { key: 'image_max_size_mb', value: '2' },
    ]
    expect(evaluatePreScanGuards(rows, 2 * MB)).toBe('ok')
    expect(evaluatePreScanGuards(rows, 2 * MB + 1)).toBe('too_large')
  })

  it('prefers disabled over oversized', () => {
    expect(evaluatePreScanGuards([{ key: 'image_uploading_enabled', value: false }], 100 * MB)).toBe('disabled')
  })
})

describe('attemptInsertFailureStatus', () => {
  it('maps a unique violation (path replay) to throttled', () => {
    expect(attemptInsertFailureStatus('23505')).toBe('throttled')
  })

  it('maps any other failure to unavailable', () => {
    expect(attemptInsertFailureStatus('08006')).toBe('unavailable')
    expect(attemptInsertFailureStatus(undefined)).toBe('unavailable')
  })
})

describe('buildCsamAlertMessage', () => {
  const details = {
    uploaderId: '22222222-2222-3333-4444-555555555555',
    uploaderName: 'Bad Actor',
    channelId: '11111111-2222-3333-4444-555555555555',
    channelName: 'Secret Lair',
    objectPath: '11111111-2222-3333-4444-555555555555/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
    sha256: 'deadbeef',
    detectedAt: '2026-09-21T12:00:00.000Z',
  }

  it('links the uploader to the admin user view and the channel to the read-only channel view', () => {
    const body = buildCsamAlertMessage(details)
    expect(body).toContain('[Bad Actor](/admin?user=22222222-2222-3333-4444-555555555555)')
    expect(body).toContain('[Secret Lair](/admin/channels/11111111-2222-3333-4444-555555555555)')
  })

  it('carries the attempted path, hash, and timestamp for the filing', () => {
    const body = buildCsamAlertMessage(details)
    expect(body).toContain('`11111111-2222-3333-4444-555555555555/message/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`')
    expect(body).toContain('`deadbeef`')
    expect(body).toContain('2026-09-21T12:00:00.000Z')
    expect(body).toContain('NCMEC')
    expect(body).toContain('Hotline.ie')
  })
})
