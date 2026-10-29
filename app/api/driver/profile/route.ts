import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { setDeviceSession } from '@/lib/server/device-session'
import { requireDriver } from '@/lib/server/driver'
import { isServiceType, isTowType } from '@/lib/service-types'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req, { allowIncomplete: true })
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-profile:${driver.id}`, 10, 10 * 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const b = (await req.json().catch(() => null)) ?? {}
  const name = String(b.name || '').trim().slice(0, 100)
  const carNumber = String(b.car_number || '').trim().slice(0, 30)
  const serviceType = b.service_type === undefined ? 'achilt' : b.service_type
  const rawCarType = b.car_type == null ? null : String(b.car_type)
  const carType = serviceType === 'achilt' ? rawCarType : null
  const serviceValid = isServiceType(serviceType) && (serviceType === 'achilt' ? isTowType(carType) : rawCarType === null || rawCarType === '')
  const existingName = String(driver.name || '').trim()
  const onboarding = !existingName || existingName === 'Шинэ жолооч'
  const s = getSupabaseAdmin()

  // Legacy/admin-created placeholder drivers still complete the stricter onboarding flow.
  // Self-registered drivers already have a real name and may use the driver map without a vehicle number.
  if (onboarding) {
    const newPin = String(b.new_pin || '')
    if (!name || !carNumber || !serviceValid) {
      return NextResponse.json({ error: 'Нэр, үйлчилгээний төрөл болон машины улсын дугаараа бүрэн оруулна уу.' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json({ error: 'Шинэ PIN 6 оронтой байна.' }, { status: 400 })
    }
    if (newPin === '000000') {
      return NextResponse.json({ error: 'Шинэ PIN нь анхны 000000 кодоос өөр байна.' }, { status: 400 })
    }

    const { data, error } = await s.rpc('complete_admin_driver_onboarding_v2', {
      p_driver_id: driver.id,
      p_name: name,
      p_car_number: carNumber,
      p_pin: newPin,
      p_service_type: serviceType,
      p_car_type: carType,
    })
    if (error) {
      const status = error.code === '22023' ? 400 : error.code === 'P0001' ? 409 : error.code === 'P0002' ? 404 : 500
      return NextResponse.json({ error: status === 400 ? 'Бүртгэлийн мэдээллээ зөв бөглөнө үү.' : 'Бүртгэл хадгалагдсангүй. Дахин оролдоно уу.' }, { status })
    }

    const profile = data?.driver
    const sessionVersion = data?.session_version
    if (!profile?.id || !sessionVersion) {
      return NextResponse.json({ error: 'Бүртгэл хадгалагдсан боловч нэвтрэлт шинэчлэгдсэнгүй.' }, { status: 500 })
    }
    const response = NextResponse.json({ success: true, driver: profile, onboarding_completed: true })
    setDeviceSession(response, profile.id, 'driver', sessionVersion)
    return response
  }

  if (b.new_pin && !/^\d{6}$/.test(String(b.new_pin))) {
    return NextResponse.json({ error: 'PIN 6 оронтой байна' }, { status: 400 })
  }
  if (!name || !serviceValid) {
    return NextResponse.json({ error: 'Мэдээлэл буруу байна' }, { status: 400 })
  }

  const photoUrl = String(b.photo_url || '').trim().slice(0, 500)
  if (photoUrl && !/^https:\/\//i.test(photoUrl)) {
    return NextResponse.json({ error: 'Зургийн холбоос HTTPS байх ёстой' }, { status: 400 })
  }

  const serviceChanged = driver.service_type !== serviceType || driver.car_type !== carType
  const { error } = await s
    .from('drivers')
    .update({
      name,
      service_type: serviceType,
      car_type: carType,
      car_number: carNumber || null,
      photo_url: photoUrl || null,
      ...(serviceChanged ? { available: false } : {}),
    })
    .eq('id', driver.id)
    .eq('active', true)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Хадгалахад алдаа гарлаа' }, { status: 500 })

  if (b.new_pin) {
    const { error: pinError } = await s.rpc('set_driver_pin_secure', { p_driver_id: driver.id, p_pin: String(b.new_pin) })
    if (pinError) return NextResponse.json({ error: 'PIN солиход алдаа гарлаа' }, { status: 500 })
    const response = NextResponse.json({ success: true, reauthenticate: true }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set('achilt_driver_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
    return response
  }

  const fresh = await requireDriver(req)
  return NextResponse.json({ driver: fresh })
}
