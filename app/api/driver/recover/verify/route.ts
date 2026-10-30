import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'
import { checkPhoneVerification, describeWeSendFailure, isWeSendConfigured } from '@/lib/server/wesend'

const VERIFICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isSessionConfigured() || !isWeSendConfigured()) {
    return NextResponse.json({ error: 'Нэвтрэх эсвэл OTP үйлчилгээ түр боломжгүй байна.' }, { status: 503 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-recover-verify:${ip}`, 20, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body?.phone)
  const verificationId = typeof body?.verification_id === 'string' ? body.verification_id.trim() : ''
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
  if (!phone || !VERIFICATION_ID.test(verificationId) || !/^\d{6}$/.test(code) || !/^\d{6}$/.test(pin) || pin === '000000') {
    return NextResponse.json({ error: 'Утас, OTP эсвэл шинэ PIN буруу байна.' }, { status: 400 })
  }
  if (!(await allowRequest(`driver-recover-verify-phone:${phone}`, 8, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа код шалгалаа. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const verification = await checkPhoneVerification(verificationId, code)
  if (!verification.ok) {
    const described = describeWeSendFailure(verification)
    const response = NextResponse.json({ error: described.error }, { status: described.status })
    if (verification.retryAfter) response.headers.set('Retry-After', String(verification.retryAfter))
    return response
  }
  const verifiedPhone = normalizeMnPhone(verification.data.to)
  if (verification.data.status !== 'approved' || verifiedPhone !== phone) {
    return NextResponse.json({ error: 'OTP баталгаажуулалт утасны дугаартай таарсангүй. Шинээр код авна уу.' }, { status: 401 })
  }

  const s = getSupabaseAdmin()
  const { data: reset, error: resetError } = await s.rpc('reset_driver_pin_verified', { p_phone: phone, p_pin: pin })
  if (resetError) {
    if (resetError.code === 'P0002') return NextResponse.json({ error: 'Идэвхтэй жолоочийн бүртгэл олдсонгүй.' }, { status: 404 })
    if (resetError.code === '22023') return NextResponse.json({ error: 'Шинэ PIN буруу байна.' }, { status: 400 })
    return NextResponse.json({ error: 'PIN шинэчилж чадсангүй. Дахин оролдоно уу.' }, { status: 503 })
  }

  const driverId = typeof reset?.driver_id === 'string' ? reset.driver_id : ''
  const sessionVersion = typeof reset?.session_version === 'string' ? reset.session_version : ''
  if (!driverId || !sessionVersion) return NextResponse.json({ error: 'PIN шинэчлэгдсэн ч нэвтрэлт үүсгэж чадсангүй.' }, { status: 503 })

  const { data: driver, error: lookupError } = await s.from('drivers')
    .select('id,name,phone,service_type,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at')
    .eq('id', driverId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupError || !driver) return NextResponse.json({ error: 'Жолоочийн мэдээлэл татаж чадсангүй.' }, { status: 503 })

  const response = NextResponse.json({ success: true, driver, redirect: '/driver' }, { headers: { 'Cache-Control': 'private, no-store' } })
  setDeviceSession(response, driverId, 'driver', sessionVersion)
  return response
}
