import { NextResponse } from 'next/server'
export async function POST() {
  const res = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  res.cookies.set('achilt_driver_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
