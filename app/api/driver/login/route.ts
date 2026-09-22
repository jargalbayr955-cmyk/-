import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  if (!isSessionConfigured()) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-login:${ip}`, 12, 10 * 60_000))) return NextResponse.json({ error: 'Олон удаа буруу оролдлоо. Түр хүлээнэ үү.' }, { status: 429 })
  const { phone, pin } = (await req.json().catch(() => null)) ?? {}
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 400 })
  if (!(await allowRequest(`driver-login-phone:${normalized}`, 15, 10 * 60_000))) return NextResponse.json({ error: 'Олон удаа оролдлоо. 10 минутын дараа дахин оролдоно уу.' }, { status: 429 })
  const s = getSupabaseAdmin()
  const { data: verified, error } = await s.rpc('verify_driver_device', { p_phone: normalized, p_pin: String(pin) })
  if (error) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  const identity = Array.isArray(verified) ? verified[0] : null
  const id = identity?.id
  if (!id) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 401 })
  const { data, error: lookupError } = await s.from('drivers').select('id,name,phone,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at,session_version').eq('id', id).is('deleted_at', null).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  if (!data?.active) return NextResponse.json({ error: 'Жолоочийн эрх хаалттай байна' }, { status: 403 })
  if ((data.session_version ?? null) !== (identity.session_version ?? null)) return NextResponse.json({ error: 'PIN өөрчлөгдсөн байна. Дахин нэвтэрнэ үү.' }, { status: 401 })
  const { session_version, ...profile } = data
  const res = NextResponse.json({ driver: profile })
  setDeviceSession(res, data.id, 'driver', session_version)
  return res
}
