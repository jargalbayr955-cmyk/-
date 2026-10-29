import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'
import { isServiceType, isTowType } from '@/lib/service-types'

export async function POST(req: NextRequest) {
  if (!isSessionConfigured()) {
    return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
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
  const serviceValid = isServiceType(serviceType)
  const vehicleValid = serviceValid && (serviceType === 'achilt' ? isTowType(carType) : rawCarType === null || rawCarType === '')

  if (!phone || !serviceValid || !vehicleValid || !name) {
    return NextResponse.json({ error: 'Нэр, утас эсвэл үйлчилгээний төрөл буруу байна.' }, { status: 400 })
  }
  if (!(await allowRequest(`driver-register-phone:${phone}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаараар олон удаа хүсэлт үүсгэлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const s = getSupabaseAdmin()
  const { data, error } = await s.rpc('start_driver_registration_v5', {
    p_phone: phone,
    p_service_type: serviceType,
    p_car_type: carType,
    p_name: name,
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
