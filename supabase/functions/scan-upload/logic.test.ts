import { describe, it, expect } from 'vitest'
import { interpretSaferResponse, isAllowedOrigin, isValidUploadPath } from './logic'

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
  it('treats an absent hashes key as clear', () => {
    expect(interpretSaferResponse({})).toBe('clear')
  })

  it('treats an empty hashes list as clear', () => {
    expect(interpretSaferResponse({ hashes: [] })).toBe('clear')
  })

  it('treats a populated hashes list as a match', () => {
    expect(interpretSaferResponse({ hashes: [{ matchDistance: 3 }] })).toBe('match')
  })

  it('treats a populated hashes object as a match', () => {
    expect(interpretSaferResponse({ hashes: { pdq: 'abc' } })).toBe('match')
  })

  it('treats malformed payloads as clear', () => {
    expect(interpretSaferResponse(null)).toBe('clear')
    expect(interpretSaferResponse('nope')).toBe('clear')
    expect(interpretSaferResponse({ hashes: null })).toBe('clear')
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
