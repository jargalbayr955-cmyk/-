import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'

const CAR_TYPES = new Set(['butten', 'chiregch'])

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-register-request:${ip}`, 12, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body?.phone)
  const carType = typeof body?.car_type === 'string' ? body.car_type : ''
  if (!phone || !CAR_TYPES.has(carType)) {
    return NextResponse.json({ error: 'Утасны дугаар эсвэл ачигчийн төрөл буруу байна.' }, { status: 400 })
  }
  if (!(await allowRequest(`driver-register-phone:${phone}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Энэ дугаараар олон удаа хүсэлт үүсгэлээ. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('start_driver_registration', { p_phone: phone, p_car_type: carType })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Энэ утасны дугаар жолоочоор бүртгэлтэй байна.' }, { status: 409 })
    if (error.code === '22023') return NextResponse.json({ error: 'Бүртгэлийн мэдээлэл буруу байна.' }, { status: 400 })
    console.error('[driver/register/request] registration request failed', { code: error.code })
    return NextResponse.json({ error: 'Бүртгэлийн хүсэлт үүсгэж чадсангүй. Дахин оролдоно уу.' }, { status: 503 })
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
