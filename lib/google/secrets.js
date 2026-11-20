import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function key() {
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET is not set')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptSecret(payload) {
  const [version, ivB64, tagB64, dataB64] = String(payload || '').split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Stored Google token is unreadable')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
