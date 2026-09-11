import 'server-only'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function getSecret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  return value
}

export type SessionRole = 'admin' | 'driver' | 'customer'
export type SessionPayload = { sub: string; role: SessionRole; exp: number }

export function signSession(sub: string, role: SessionRole) {
  const payload: SessionPayload = { sub, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(value: string | undefined, role?: SessionRole): SessionPayload | null {
  if (!value) return null
  const [body, sig] = value.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload?.sub || !payload?.role || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (role && payload.role !== role) return null
    return payload
  } catch { return null }
}

export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b)
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

const fallbackBuckets = new Map<string, { count: number; resetAt: number }>()
export async function allowRequest(key: string, limit = 20, windowMs = 60_000) {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
      p_bucket: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    })
    if (!error && typeof data === 'boolean') return data
  } catch {}
  const now = Date.now(); const current = fallbackBuckets.get(key)
  if (!current || current.resetAt <= now) { fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true }
  if (current.count >= limit) return false
  current.count += 1; return true
}

export function getClientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim()
}

export function normalizeMnPhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.startsWith('976') ? digits.slice(3) : digits
  if (!/^\d{8}$/.test(local)) return null
  return `+976${local}`
}
