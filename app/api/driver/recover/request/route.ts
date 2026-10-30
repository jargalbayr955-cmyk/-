import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'
import { describeWeSendFailure, isWeSendConfigured, startPhoneVerification } from '@/lib/server/wesend'

export async function POST(req: NextRequest) {
  if (!isWeSendConfigured()) {
    return NextResponse.json({ error: 'OTP үйлчилгээ одоогоор тохируулагдаагүй байна.' }, { status: 503 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-recover-request:${ip}`, 12, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа код хүссэн байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body && typeof body === 'object' ? (body as { phone?: unknown }).phone : null)
  if (!phone) return NextResponse.json({ error: '8 оронтой утасны дугаараа оруулна уу.' }, { status: 400 })
  if (!(await allowRequest(`driver-recover-phone:${phone}`, 5, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаар руу олон удаа код хүссэн байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const s = getSupabaseAdmin()
  const { data: driver, error: lookupError } = await s.from('drivers')
    .select('id')
    .eq('phone', phone)
    .eq('active', true)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Жолоочийн бүртгэл шалгахад алдаа гарлаа.' }, { status: 503 })
  if (!driver) return NextResponse.json({ error: 'Энэ дугаарт идэвхтэй жолоочийн бүртгэл олдсонгүй.' }, { status: 404 })

  const result = await startPhoneVerification(phone.slice(4))
  if (!result.ok) {
    const described = describeWeSendFailure(result)
    const response = NextResponse.json({ error: described.error }, { status: described.status })
    if (result.retryAfter) response.headers.set('Retry-After', String(result.retryAfter))
    return response
  }

  const providerPhone = normalizeMnPhone(result.data.to)
  if (providerPhone !== phone || result.data.status !== 'pending') {
    return NextResponse.json({ error: 'OTP үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }

  return NextResponse.json({
    verification_id: result.data.id,
    expires_at: result.data.expiresAt,
    resend_after_seconds: 60,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
