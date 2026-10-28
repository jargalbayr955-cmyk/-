import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'
import { checkPhoneVerification, describeWeSendFailure, isWeSendConfigured } from '@/lib/server/wesend'

const VERIFICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isSessionConfigured() || !isWeSendConfigured()) {
    console.error('[customer/otp/verify] OTP or session signing is not configured')
    return NextResponse.json({ error: 'OTP үйлчилгээ одоогоор тохируулагдаагүй байна.' }, { status: 503 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-otp-verify:${ip}`, 20, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const normalized = normalizeMnPhone(payload.phone)
  const verificationId = typeof payload.verification_id === 'string' ? payload.verification_id.trim() : ''
  const code = typeof payload.code === 'string' ? payload.code.trim() : ''
  if (!normalized || !VERIFICATION_ID.test(verificationId) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Утасны дугаар эсвэл OTP код буруу байна.' }, { status: 400 })
  }
  if (!(await allowRequest(`customer-otp-verify-phone:${normalized}`, 8, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа код шалгалаа. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const result = await checkPhoneVerification(verificationId, code)
  if (!result.ok) {
    const described = describeWeSendFailure(result)
    const response = NextResponse.json({ error: described.error }, { status: described.status })
    if (result.retryAfter) response.headers.set('Retry-After', String(result.retryAfter))
    return response
  }

  const providerPhone = normalizeMnPhone(result.data.to)
  if (result.data.status !== 'approved' || providerPhone !== normalized) {
    console.error('[customer/otp/verify] Verification target did not match the requested phone')
    return NextResponse.json({ error: 'OTP баталгаажуулалт таарсангүй. Шинээр код авна уу.' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data: user, error } = await admin
    .from('users')
    .upsert({ phone: normalized }, { onConflict: 'phone' })
    .select('id, phone, active')
    .single()

  if (error || !user?.id) {
    console.error('[customer/otp/verify] Customer lookup/create failed', { code: error?.code })
    return NextResponse.json({ error: 'Нэвтрэх үйлчилгээнд алдаа гарлаа. Дахин оролдоно уу.' }, { status: 503 })
  }
  if (user.active === false) return NextResponse.json({ error: 'Энэ хэрэглэгчийн эрх идэвхгүй байна.' }, { status: 403 })

  const response = NextResponse.json({ user: { id: String(user.id), phone: normalized } })
  setDeviceSession(response, String(user.id), 'customer')
  return response
}
