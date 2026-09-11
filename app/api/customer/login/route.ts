import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone, signSession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-login:${ip}`, 10, 10 * 60_000))) return NextResponse.json({ error: 'Олон удаа буруу оролдлоо. Түр хүлээнэ үү.' }, { status: 429 })
  const { phone, pin } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 400 })
  const { data: id } = await getSupabaseAdmin().rpc('verify_customer_pin', { p_phone: normalized, p_pin: String(pin) })
  if (!id) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 401 })
  const res = NextResponse.json({ user: { id, phone: normalized } })
  res.cookies.set('achilt_customer_session', signSession(String(id), 'customer'), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60*60*24*7 })
  return res
}
