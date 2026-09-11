import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAuthClient } from '@/lib/server/supabase-auth'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const { phone } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  if (!normalized) return NextResponse.json({ error: 'Утасны дугаар буруу байна' }, { status: 400 })

  const ip = getClientIp(req)
  const [ipAllowed, phoneAllowed] = await Promise.all([
    allowRequest(`customer-otp-ip:${ip}`, 8, 10 * 60_000),
    allowRequest(`customer-otp-phone:${normalized}`, 4, 10 * 60_000),
  ])
  if (!ipAllowed || !phoneAllowed) {
    return NextResponse.json({ error: 'Код олон удаа хүссэн байна. Түр хүлээнэ үү.' }, { status: 429 })
  }

  const { error } = await getSupabaseAuthClient().auth.signInWithOtp({
    phone: normalized,
    options: { shouldCreateUser: true },
  })
  if (error) {
    console.error('customer otp request failed', error.message)
    return NextResponse.json({ error: 'SMS код илгээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.' }, { status: 503 })
  }
  return NextResponse.json({ success: true })
}
