import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'
import { isServiceType, isTowType } from '@/lib/service-types'
import { checkPhoneVerification, describeWeSendFailure, isWeSendConfigured } from '@/lib/server/wesend'

const VERIFICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isSessionConfigured() || !isWeSendConfigured()) {
    return NextResponse.json({ error: 'Нэвтрэх эсвэл OTP үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }

  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-register-request:${ip}`, 12, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body?.phone)
  const serviceType = body?.service_type === undefined ? 'achilt' : body?.service_type
  const rawCarType = typeof body?.car_type === 'string' ? body.car_type : body?.car_type == null ? null : ''
  const carType = serviceType === 'achilt' ? rawCarType : null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
  const verificationId = typeof body?.verification_id === 'string' ? body.verification_id.trim() : ''
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const serviceValid = isServiceType(serviceType)
  const vehicleValid = serviceValid && (serviceType === 'achilt' ? isTowType(carType) : rawCarType === null || rawCarType === '')

  if (!phone || !serviceValid || !vehicleValid || !name || !/^\d{6}$/.test(pin) || pin === '000000' || !VERIFICATION_ID.test(verificationId) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Нэр, утас, PIN, OTP эсвэл үйлчилгээний төрөл буруу байна.' }, { status: 400 })
  }
  if (!(await allowRequest(`driver-register-phone:${phone}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаараар олон удаа хүсэлт үүсгэлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
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
  const { data, error } = await s.rpc('start_driver_registration_v6', {
    p_phone: phone,
    p_service_type: serviceType,
    p_car_type: carType,
    p_name: name,
    p_pin: pin,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Энэ утасны дугаар жолоочоор бүртгэлтэй байна.' }, { status: 409 })
    if (error.code === '22023') return NextResponse.json({ error: 'Бүртгэлийн мэдээлэл буруу байна.' }, { status: 400 })
    console.error('[driver/register/request] registration request failed', { code: error.code })
    return NextResponse.json({ error: 'Бүртгэл үүсгэж чадсангүй. Дахин оролдоно уу.' }, { status: 503 })
  }

  const driverId = typeof data?.driver_id === 'string' ? data.driver_id : ''
  if (!driverId) {
    console.error('[driver/register/request] registration returned no driver id')
    return NextResponse.json({ error: 'Бүртгэл үүссэн ч нэвтрэх боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }

  const { data: driver, error: lookupError } = await s.from('drivers')
    .select('id,name,phone,service_type,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at,session_version')
    .eq('id', driverId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupError || !driver?.session_version) {
    console.error('[driver/register/request] registered driver session lookup failed')
    return NextResponse.json({ error: 'Бүртгэл үүссэн ч нэвтрэх боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }

  const { session_version, ...profile } = driver
  const response = NextResponse.json({
    driver: profile,
    autoStart: true,
    payment_required: false,
    redirect: '/driver',
  }, { headers: { 'Cache-Control': 'private, no-store' } })
  setDeviceSession(response, driver.id, 'driver', session_version)
  return response
}
