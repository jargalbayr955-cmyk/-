import { NextResponse } from 'next/server'
export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set('achilt_customer_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
