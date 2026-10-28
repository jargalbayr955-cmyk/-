import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, normalizeMnPhone } from '@/lib/server/security'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await allowRequest(`driver-register-confirm:${ip}`, 30, 10 * 60_000))) {
    return NextResponse.json({ error: 'Олон удаа шалгалаа. Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const phone = normalizeMnPhone(body?.phone)
  const requestId = typeof body?.request_id === 'string' ? body.request_id.trim() : ''
  if (!phone || !UUID.test(requestId)) {
    return NextResponse.json({ error: 'Бүртгэлийн мэдээлэл буруу байна.' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('get_driver_registration_status', { p_request_id: requestId, p_phone: phone })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 503
    return NextResponse.json({ error: status === 404 ? 'Бүртгэлийн хүсэлт олдсонгүй. Шинээр эхэлнэ үү.' : status === 400 ? 'Бүртгэлийн мэдээлэл буруу байна.' : 'Төлбөрийн төлөв шалгаж чадсангүй. Дахин оролдоно уу.' }, { status })
  }

  if (data?.status === 'paid' || data?.status === 'contacted') {
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const expiresAt = new Date(String(data?.expires_at || '')).getTime()
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return NextResponse.json({ error: 'Бүртгэлийн хүсэлтийн 24 цагийн хугацаа дууссан. Шинээр эхэлнэ үү.', status: 'expired' }, { status: 410 })
  }
  return NextResponse.json({ error: 'Төлбөр хараахан баталгаажаагүй байна. Шилжүүлснээс хойш хэдэн секунд хүлээгээд дахин дарна уу.', status: 'awaiting_payment' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
}
