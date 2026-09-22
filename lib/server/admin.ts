import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_TTL_SECONDS, signSession, verifySession } from './security'
import { getSupabaseAdmin } from './supabase-admin'

export const ADMIN_COOKIE = 'achilt_admin_session'
export type AdminCredential = { password_hash: string; session_version: string; must_change_password: boolean }
type AdminAccess = { ok: true; credential: AdminCredential } | { ok: false; status: number; error: string }

export async function getAdminCredential(): Promise<AdminCredential> {
  const { data, error } = await getSupabaseAdmin().from('admin_credentials')
    .select('password_hash,session_version,must_change_password').eq('id', 1).maybeSingle()
  if (error || !data) throw new Error('Admin credentials unavailable')
  return data
}

export async function requireAdmin(req: NextRequest, allowTemporary = false): Promise<AdminAccess> {
  try {
    const session = verifySession(req.cookies.get(ADMIN_COOKIE)?.value, 'admin')
    if (!session) return { ok: false, status: 401, error: 'Админаар дахин нэвтэрнэ үү.' }
    const credential = await getAdminCredential()
    if (session.sub !== credential.session_version) return { ok: false, status: 401, error: 'Нэвтрэлт дууссан байна. Дахин нэвтэрнэ үү.' }
    if (credential.must_change_password && !allowTemporary) return { ok: false, status: 403, error: 'Эхлээд түр нууц үгээ солино уу.' }
    return { ok: true, credential }
  } catch {
    return { ok: false, status: 503, error: 'Нэвтрэлтийг шалгаж чадсангүй. Дахин оролдоно уу.' }
  }
}

export function setAdminCookie(res: NextResponse, version: string) {
  res.cookies.set(ADMIN_COOKIE, signSession(version, 'admin'), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: ADMIN_SESSION_TTL_SECONDS,
  })
}

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function sameOriginAdminRequest(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin && req.headers.get('sec-fetch-site') !== 'cross-site'
}
