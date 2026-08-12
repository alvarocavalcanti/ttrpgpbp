const PBKDF2_ITERATIONS = 210000
const SALT_BYTES = 16
const HASH_BITS = 256

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const matches = hex.match(/.{2}/g) ?? []
  const bytes = new Uint8Array(new ArrayBuffer(matches.length))
  matches.forEach((b, i) => { bytes[i] = parseInt(b, 16) })
  return bytes
}

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_BITS
  )
  return new Uint8Array(bits)
}

// Password-based key derivation for channel access passwords. The per-channel
// salt makes a leaked hash useless for rainbow-table lookup and prevents
// cross-channel replay from a single DB dump.
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)))
  const hash = await deriveBits(password, salt)
  return { hash: bytesToHex(hash), salt: bytesToHex(salt) }
}

// Re-derives the hash for a given stored salt (used when verifying a password
// at join time, where the salt must match the one used at creation).
export async function hashPasswordWithSalt(password: string, saltHex: string): Promise<string> {
  const hash = await deriveBits(password, hexToBytes(saltHex))
  return bytesToHex(hash)
}

// Legacy unsalted SHA-256 hash. Kept only to verify passwords on channels that
// predate salting (password_salt IS NULL); new hashes never use this path.
export async function hashPasswordLegacy(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return bytesToHex(new Uint8Array(hashBuffer))
}
