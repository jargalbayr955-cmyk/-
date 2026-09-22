import 'server-only'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// OWASP's scrypt profile: 32 MiB, N=2^15, r=8, p=3.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const PREFIX = 'scrypt-v1'
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export function validAdminPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && value.trim().length >= 12
}

export async function hashAdminPassword(password: string) {
  if (!validAdminPassword(password)) throw new Error('Invalid password length')
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt)
  return `${PREFIX}$${salt}$${key.toString('hex')}`
}

export async function verifyAdminPassword(password: unknown, encoded: string) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) return false
  const [prefix, salt, hash, extra] = encoded.split('$')
  if (prefix !== PREFIX || extra !== undefined || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false
  const key = await derive(password, salt)
  return timingSafeEqual(key, Buffer.from(hash, 'hex'))
}
