import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  if (!isSessionConfigured()) {
    console.error('[customer/login] Session signing is not configured')
    return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 503 })
  }
  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-login:${ip}`, 10, 10 * 60_000))) return NextResponse.json({ error: 'Олон удаа буруу оролдлоо. Түр хүлээнэ үү.' }, { status: 429 })
  const { phone, pin } = await req.json().catch(() => ({}))
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 400 })
  const { data: id, error } = await getSupabaseAdmin().rpc('verify_customer_pin', { p_phone: normalized, p_pin: String(pin) })
  if (error) {
    console.error('[customer/login] PIN verification unavailable', { code: error.code })
    return NextResponse.json({ error: 'Нэвтрэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }
  if (!id) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 401 })
  const res = NextResponse.json({ user: { id, phone: normalized } })
  setDeviceSession(res, String(id), 'customer')
  return res
}
