import { NextRequest, NextResponse } from 'next/server'
import { setDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, isSessionConfigured, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  // Validate before any database write: registration must not succeed without a usable session.
  if (!isSessionConfigured()) {
    console.error('[customer/register] Session signing is not configured')
    return NextResponse.json({ error: 'Бүртгүүлэх үйлчилгээ түр боломжгүй байна. Түр хүлээгээд дахин оролдоно уу.' }, { status: 503 })
  }
  const ip = getClientIp(req)
  if (!(await allowRequest(`customer-register:${ip}`, 6, 10 * 60_000))) return NextResponse.json({ error: 'Түр хүлээгээд дахин оролдоно уу' }, { status: 429 })
  const { phone, pin } = (await req.json().catch(() => null)) ?? {}
  const normalized = normalizeMnPhone(phone)
  if (!normalized || !/^\d{4,8}$/.test(String(pin || ''))) return NextResponse.json({ error: 'Утас эсвэл PIN буруу байна' }, { status: 400 })
  const admin = getSupabaseAdmin()
  const { data: existing, error: lookupError } = await admin
    .from('users')
    .select('id')
    .eq('phone', normalized)
    .limit(1)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Бүртгэл шалгахад алдаа гарлаа' }, { status: 500 })
  if (existing) return NextResponse.json({ error: 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' }, { status: 409 })

  const { data, error } = await admin.rpc('register_customer_secure', { p_phone: normalized, p_pin: String(pin) })
  if (error || !data) {
    if (/already|duplicate/i.test(error?.message || '')) return NextResponse.json({ error: 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' }, { status: 409 })
    console.error('[customer/register] Registration unavailable', { code: error?.code })
    return NextResponse.json({ error: 'Бүртгүүлэх үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }, { status: 503 })
  }
  const res = NextResponse.json({ user: { id: data, phone: normalized } })
  setDeviceSession(res, String(data), 'customer')
  return res
}
