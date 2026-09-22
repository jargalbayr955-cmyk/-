import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireDriver } from '@/lib/server/driver'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-profile:${driver.id}`, 10, 10 * 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const b = (await req.json().catch(() => null)) ?? {}
  const name = String(b.name || '').trim().slice(0, 100)
  const carType = String(b.car_type || '')
  if (b.new_pin && !/^\d{6}$/.test(String(b.new_pin))) {
    return NextResponse.json({ error: 'PIN 6 оронтой байна' }, { status: 400 })
  }
  if (!name || !['butten', 'chiregch'].includes(carType)) {
    return NextResponse.json({ error: 'Мэдээлэл буруу байна' }, { status: 400 })
  }

  const s = getSupabaseAdmin()
  const photoUrl = String(b.photo_url || '').trim().slice(0, 500)
  if (photoUrl && !/^https:\/\//i.test(photoUrl)) {
    return NextResponse.json({ error: 'Зургийн холбоос HTTPS байх ёстой' }, { status: 400 })
  }

  const { error } = await s
    .from('drivers')
    .update({
      name,
      car_type: carType,
      car_number: String(b.car_number || '').trim().slice(0, 30),
      photo_url: photoUrl || null,
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
