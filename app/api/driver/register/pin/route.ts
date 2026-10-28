import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-register-pin:${ip}`, 12, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body?.phone)
  const requestId = typeof body?.request_id === 'string' ? body.request_id.trim() : ''
  const pin = String(body?.pin || '')
  if (!phone || !UUID.test(requestId) || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: '4-8 оронтой PIN код оруулна уу.' }, { status: 400 })
  }
  if (!(await allowRequest(`driver-register-pin-phone:${phone}`, 8, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа PIN оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('complete_driver_registration_pin', {
    p_request_id: requestId,
    p_phone: phone,
    p_pin: pin,
  })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === 'P0001' ? 409 : error.code === '22023' ? 400 : 503
    const message = status === 404 ? 'Төлбөр баталгаажсан бүртгэл олдсонгүй.' : status === 409 ? 'PIN тохируулах боломжгүй байна. Бүртгэлээ дахин шалгана уу.' : status === 400 ? 'PIN код буруу байна.' : 'PIN хадгалж чадсангүй. Дахин оролдоно уу.'
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
