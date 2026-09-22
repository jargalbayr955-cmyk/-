import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  if (!isSessionConfigured()) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-login:${ip}`, 12, 10 * 60_000))) return NextResponse.json({ error: 'Олон удаа буруу оролдлоо. Түр хүлээнэ үү.' }, { status: 429 })
  const { phone, pin } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 400 })
  const s = getSupabaseAdmin()
  const { data: id, error } = await s.rpc('verify_driver_pin', { p_phone: normalized, p_pin: String(pin) })
  if (error) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  if (!id) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 401 })
  const { data, error: lookupError } = await s.from('drivers').select('id,name,phone,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at').eq('id', id).is('deleted_at', null).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  if (!data?.active) return NextResponse.json({ error: 'Жолоочийн эрх хаалттай байна' }, { status: 403 })
  const res = NextResponse.json({ driver: data })
  setDeviceSession(res, data.id, 'driver')
  return res
}
