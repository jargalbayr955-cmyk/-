import { NextRequest, NextResponse } from 'next/server'
import { readTrustedCustomerDevice, setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'
import { describeWeSendFailure, isWeSendConfigured, startPhoneVerification } from '@/lib/server/wesend'

export async function POST(req: NextRequest) {
  if (!isSessionConfigured() || !isWeSendConfigured()) {
    console.error('[customer/otp/request] OTP or session signing is not configured')
    return NextResponse.json({ error: 'OTP үйлчилгээ одоогоор тохируулагдаагүй байна.' }, { status: 503 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-otp-request:${ip}`, 15, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа код хүссэн байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const normalized = normalizeMnPhone(body && typeof body === 'object' ? (body as { phone?: unknown }).phone : null)
  if (!normalized) return NextResponse.json({ error: '8 оронтой утасны дугаараа оруулна уу.' }, { status: 400 })

  const trusted = readTrustedCustomerDevice(req)
  if (trusted) {
    const { data: user, error } = await getSupabaseAdmin()
      .from('users')
      .select('id, phone, active')
      .eq('id', trusted.sub)
      .maybeSingle()

    if (error) {
      console.error('[customer/otp/request] Trusted customer lookup failed', { code: error.code })
      return NextResponse.json({ error: 'Нэвтрэх үйлчилгээнд алдаа гарлаа. Дахин оролдоно уу.' }, { status: 503 })
    }

    const trustedPhone = normalizeMnPhone(user?.phone)
    if (user?.id && trustedPhone === normalized) {
      if (user.active === false) return NextResponse.json({ error: 'Энэ хэрэглэгчийн эрх идэвхгүй байна.' }, { status: 403 })
      const response = NextResponse.json({ trusted_login: true, user: { id: String(user.id), phone: normalized } })
      setDeviceSession(response, String(user.id), 'customer')
      return response
    }
  }

  if (!(await allowRequest(`customer-otp-request-phone:${normalized}`, 5, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаар руу олон удаа код хүссэн байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const result = await startPhoneVerification(normalized.slice(4))
  if (!result.ok) {
    const described = describeWeSendFailure(result)
    const response = NextResponse.json({ error: described.error }, { status: described.status })
    if (result.retryAfter) response.headers.set('Retry-After', String(result.retryAfter))
    return response
  }

  const providerPhone = normalizeMnPhone(result.data.to)
  if (providerPhone !== normalized || result.data.status !== 'pending') {
    console.error('[customer/otp/request] Provider returned an unexpected verification target or status')
    return NextResponse.json({ error: 'OTP үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }

  return NextResponse.json({
    verification_id: result.data.id,
    expires_at: result.data.expiresAt,
    resend_after_seconds: 60,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
