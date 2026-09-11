import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, signSession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!allowRequest(`driver-login:${ip}`, 12, 10 * 60_000)) {
    return NextResponse.json({ error: 'Олон удаа буруу оролдлоо. Түр хүлээнэ үү.' }, { status: 429 })
  }
  const { phone, pin } = await req.json().catch(() => ({}))
  if (typeof phone !== 'string' || typeof pin !== 'string' || phone.length < 8 || pin.length < 4) {
    return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('drivers')
    .select('id,name,phone,car_type,price,available,lat,lng')
    .eq('phone', phone)
    .eq('pin', pin)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Дугаар эсвэл PIN буруу байна' }, { status: 401 })
  const res = NextResponse.json({ driver: data })
  res.cookies.set('achilt_driver_session', signSession(data.id, 'driver'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
