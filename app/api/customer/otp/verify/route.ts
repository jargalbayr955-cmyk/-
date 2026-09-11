import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAuthClient } from '@/lib/server/supabase-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone, signSession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const { phone, token } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  const otp = String(token || '').replace(/\D/g, '')
  if (!normalized || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: 'Код буруу байна' }, { status: 400 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-otp-verify:${ip}:${normalized}`, 8, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа буруу код орууллаа. Түр хүлээнэ үү.' }, { status: 429 })
  }

  const { data: authData, error: authError } = await getSupabaseAuthClient().auth.verifyOtp({
    phone: normalized,
    token: otp,
    type: 'sms',
  })
  if (authError || !authData.user?.id) {
    return NextResponse.json({ error: 'Код буруу эсвэл хугацаа дууссан байна' }, { status: 401 })
  }

  const { data: localId, error: linkError } = await getSupabaseAdmin().rpc('upsert_customer_from_verified_phone', {
    p_phone: normalized,
    p_auth_user_id: authData.user.id,
  })
  if (linkError || !localId) {
    if (/disabled/i.test(linkError?.message || '')) return NextResponse.json({ error: 'Таны хэрэглэгчийн эрх хаалттай байна' }, { status: 403 })
    return NextResponse.json({ error: 'Нэвтрэхэд алдаа гарлаа' }, { status: 500 })
  }

  const res = NextResponse.json({ user: { id: localId, phone: normalized } })
  res.cookies.set('achilt_customer_session', signSession(String(localId), 'customer'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
