import { NextRequest, NextResponse } from 'next/server'
import { allowRequest, getClientIp, safeEqual, signSession, verifySession } from '@/lib/server/security'

const COOKIE = 'achilt_admin_session'

export async function GET(req: NextRequest) {
  const session = verifySession(req.cookies.get(COOKIE)?.value, 'admin')
  return NextResponse.json({ authenticated: Boolean(session) }, { status: session ? 200 : 401 })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`admin-login:${ip}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  }
  const { password } = await req.json().catch(() => ({}))
  const expected = process.env.ADMIN_PASSWORD
  if (!expected || typeof password !== 'string' || !safeEqual(password, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const res = NextResponse.json({ authenticated: true })
  res.cookies.set(COOKIE, signSession('admin', 'admin'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 4,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false })
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
