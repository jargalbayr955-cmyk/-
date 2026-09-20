import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone, signSession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-register:${ip}`, 6, 10 * 60_000))) return NextResponse.json({ error: 'Түр хүлээгээд дахин оролдоно уу' }, { status: 429 })
  const { phone, pin } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Утас эсвэл PIN буруу байна' }, { status: 400 })
  const admin = getSupabaseAdmin()
  const { data: existing, error: lookupError } = await admin
    .from('users')
    .select('id')
    .eq('phone', normalized)
    .limit(1)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Бүртгэл шалгахад алдаа гарлаа' }, { status: 500 })
  if (existing) return NextResponse.json({ error: 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' }, { status: 409 })

  const { data, error } = await admin.rpc('register_customer_secure', { p_phone: normalized, p_pin: String(pin) })
  if (error || !data) return NextResponse.json({ error: /already|duplicate/i.test(error?.message || '') ? 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' : 'Бүртгэхэд алдаа гарлаа' }, { status: 409 })
  const res = NextResponse.json({ user: { id: data, phone: normalized } })
  res.cookies.set('achilt_customer_session', signSession(String(data), 'customer'), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60*60*24*7 })
  return res
}
