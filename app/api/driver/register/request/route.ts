import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'
import { isServiceType, isTowType } from '@/lib/service-types'

const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/

function normalizeFacePhoto(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > 300_000) return undefined
  const match = JPEG_DATA_URL.exec(value)
  if (!match) return undefined
  try {
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes.length < 4 || bytes.length > 200_000) return undefined
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return undefined
  } catch {
    return undefined
  }
  return value
}

export async function POST(req: NextRequest) {
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
  const carNumber = typeof body?.car_number === 'string' ? body.car_number.trim().toUpperCase().slice(0, 30) : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  const photoDataUrl = normalizeFacePhoto(body?.photo_data_url)
  const serviceValid = isServiceType(serviceType)
  const vehicleValid = serviceValid && (serviceType === 'achilt' ? isTowType(carType) : rawCarType === null || rawCarType === '')
  const pinValid = /^\d{6}$/.test(pin) && pin !== '000000'
  if (!phone || !serviceValid || !vehicleValid || !name || !carNumber || !pinValid || photoDataUrl === undefined) {
    return NextResponse.json({
      error: photoDataUrl === undefined
        ? 'Нүүр зураг буруу эсвэл хэт том байна.'
        : 'Нэр, утас, машин/техникийн дугаар эсвэл 6 оронтой PIN буруу байна.',
    }, { status: 400 })
  }
  if (!(await allowRequest(`driver-register-phone:${phone}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаараар олон удаа хүсэлт үүсгэлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('start_driver_registration_v4', {
    p_phone: phone,
    p_service_type: serviceType,
    p_car_type: carType,
    p_name: name,
    p_car_number: carNumber,
    p_pin: pin,
    p_photo_data_url: photoDataUrl,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Энэ утасны дугаар жолоочоор бүртгэлтэй байна.' }, { status: 409 })
    if (error.code === '22023') return NextResponse.json({ error: 'Бүртгэлийн мэдээлэл буруу байна.' }, { status: 400 })
    console.error('[driver/register/request] registration request failed', { code: error.code })
    return NextResponse.json({ error: 'Бүртгэл үүсгэж чадсангүй. Дахин оролдоно уу.' }, { status: 503 })
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
